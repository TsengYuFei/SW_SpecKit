import { createHash, randomUUID } from 'node:crypto';
import { catalogServer } from './catalog-server.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
import type { GridSheet } from '../../shared/src/schemas/source.js';

type Options = {
  kind?: 'canonical' | 'performance';
  historyCount?: number;
  active?: boolean;
  jobStatus?: 'pending' | 'writing' | 'verified' | 'conflict' | 'failed';
};

function fixtureSheet(performance: boolean): GridSheet {
  const sheet: GridSheet = { sheetId: 17, title: '合成學習單', rows: [], merges: [] };
  const put = (row: number, column: number, value: string) => {
    sheet.rows[row] ??= [];
    sheet.rows[row]![column] = { userEnteredValue: { stringValue: value } };
  };
  const merge = (row: number, endRow: number, column: number, endColumn: number) =>
    sheet.merges.push({
      sheetId: 17,
      startRowIndex: row,
      endRowIndex: endRow,
      startColumnIndex: column,
      endColumnIndex: endColumn,
    });
  put(0, 0, '題號');
  put(0, 1, '題目');
  put(0, 3, '作答');
  merge(0, 1, 3, 5);
  if (performance) {
    for (let index = 0; index < 20; index++) {
      const row = 1 + index * 2;
      put(row, 0, String(index + 1));
      merge(row, row + 2, 0, 1);
      for (let item = 0; item < 2; item++) {
        put(row + item, 1, `第${index + 1}題合成子題${item + 1}`);
        put(row + item, 3, `（${item + 1}）`);
      }
    }
  } else {
    put(1, 0, '1');
    put(1, 1, '3+4？');
    merge(1, 2, 3, 5);
    put(2, 0, '2');
    put(2, 1, '水的化學式？');
    put(2, 3, '（1）');
    put(3, 1, '水的沸點？');
    put(3, 3, '（2）');
    merge(2, 4, 0, 1);
  }
  // Dense arrays keep serialized source snapshots equivalent to their parsed representation.
  sheet.rows = sheet.rows.map((row) => Array.from({ length: 5 }, (_, i) => row[i] ?? {}));
  return sheet;
}

/** Isolated real SQLite/HTTP fixture. Seeding uses existing repositories, never a live database. */
export async function resultExportFixture(options: Options = {}) {
  const historyCount = options.historyCount ?? 1;
  if (!Number.isInteger(historyCount) || historyCount < 1 || historyCount > 10)
    throw new Error('無效的合成場次數');
  const server = await catalogServer();
  let closed = false;
  async function close() {
    if (closed) return;
    await server.stop();
    closed = true;
  }
  try {
    // Prevent background writeback from racing deliberately seeded job states or corruption.
    await server.worker!.stop();
    const client = await server.client();
    const session = server.sessions.find(client.cookie, 'teacher')!;
    const p = server.persistence;
    const db = p.connection.database;
    const performance = options.kind === 'performance';
    const sheet = fixtureSheet(performance);
    const questions = parseGuidedNotes([sheet]);
    const googleCalls = { read: 0, write: 0 };
    let offline = false;
    function readSheet() {
      googleCalls.read++;
      if (offline) throw new AppError('NETWORK_ERROR');
      return structuredClone(sheet);
    }
    server.gateway.read = async () => [readSheet()];
    server.gateway.readFirstSheet = async () => ({
      spreadsheetTitle: '合成教材',
      sheet: readSheet(),
    });
    server.gateway.readSheetById = async (_id, sheetId) => {
      if (sheetId !== sheet.sheetId) throw new AppError('SHEET_NOT_FOUND_OR_INACCESSIBLE');
      return readSheet();
    };
    server.gateway.write = async (_id, _credentials, updates) => {
      googleCalls.write++;
      if (offline) throw new AppError('NETWORK_ERROR');
      for (const { target, answer } of updates) {
        if (target.sheetId !== sheet.sheetId) throw new AppError('SOURCE_CONFLICT');
        sheet.rows[target.rowIndex]![target.columnIndex] = {
          userEnteredValue: { stringValue: answer },
        };
      }
    };
    const owned = new Set<string>();
    function seed(ended: boolean) {
      return p.connection.transaction(() => {
        const activity = p.activities.create({
          ownerAccountId: 'test-owner-a',
          groupCount: performance ? 30 : 3,
          source: {
            spreadsheetId: 'source-one',
            spreadsheetTitle: '合成教材',
            sheet: structuredClone(sheet),
            questions,
          },
        });
        owned.add(activity.id);
        const groups = p.activities.groups(activity.id);
        const participants = groups.slice(0, performance ? 30 : 2).map((group, index) => {
          const participant = p.participation.participant(
            createHash('sha256').update(`invalid-demo-${activity.id}-${index}`).digest('hex'),
          );
          p.participation.join(
            activity.id,
            group.id,
            participant.id,
            performance ? `合成組${index + 1}` : index === 0 ? '甲組' : '乙組',
          );
          return participant;
        });
        p.activities.start(activity.id, 'test-owner-a');
        function submit(group: number, question: number, answers: string[]) {
          const q = questions[question]!;
          p.participation.submit(
            activity.id,
            participants[group]!.id,
            q.id,
            randomUUID(),
            Object.fromEntries(q.items.map((item, index) => [item.id, answers[index]!])),
          );
        }
        if (performance) {
          for (let group = 0; group < 30; group++)
            for (let question = 0; question < 20; question++)
              submit(group, question, [
                `合成答案${group + 1}-${question + 1}-1`,
                `合成答案${group + 1}-${question + 1}-2`,
              ]);
        } else {
          submit(0, 1, ['H₂O', '100°C']);
          submit(1, 0, ['7']);
          submit(1, 1, ['HO₂', '90°C']);
          submit(0, 0, ['8']);
        }
        if (ended) {
          db.prepare(
            "UPDATE activities SET phase='ended',ended_at=?,revision=revision+1 WHERE id=?",
          ).run(Date.now(), activity.id);
          const job = p.writebacks.createForEnded(activity.id);
          // Make history eligible for creating the next fixture activity before desired states are applied.
          db.prepare(
            "UPDATE writeback_question_states SET status='verified',safe_error_code=NULL,next_attempt_at=NULL WHERE job_id=?",
          ).run(String(job.id));
          db.prepare("UPDATE writeback_jobs SET status='verified',reason_code=NULL WHERE id=?").run(
            String(job.id),
          );
        }
        return activity.id;
      });
    }
    const histories = Array.from({ length: historyCount }, () => seed(true));
    const activeActivity = options.active ? seed(false) : null;
    const jobStatus = options.jobStatus ?? 'verified';
    p.connection.transaction(() => {
      for (const id of histories) {
        const jobId = String(p.writebacks.getForActivity(id)!.id);
        db.prepare('UPDATE writeback_jobs SET status=? WHERE id=?').run(jobStatus, jobId);
        db.prepare('UPDATE writeback_question_states SET status=? WHERE job_id=?').run(
          jobStatus,
          jobId,
        );
      }
    });
    function requireOwned(id: string) {
      if (!owned.has(id)) throw new Error('只允許操作本fixture建立的活動');
    }
    return {
      server,
      client,
      histories,
      activeActivity,
      googleCalls,
      close,
      async setGoogleOffline(value: boolean) {
        offline = value;
      },
      snapshot(id: string) {
        requireOwned(id);
        return server.history!.detail(session.sessionId, id).snapshot;
      },
      injectFault(id: string, fault: 'missing-nonwinner' | 'missing-answer' | 'missing-result') {
        requireOwned(id);
        p.connection.transaction(() => {
          if (fault === 'missing-result') {
            db.prepare('DELETE FROM results WHERE activity_id=?').run(id);
            return;
          }
          const row = db
            .prepare(
              `SELECT s.id FROM submissions s WHERE s.activity_id=?
            AND NOT EXISTS(SELECT 1 FROM results r WHERE r.activity_id=s.activity_id AND r.winner_submission_id=s.id)
            ORDER BY s.sequence DESC LIMIT 1`,
            )
            .get(id);
          if (!row) throw new Error('沒有可注入故障的非成功組提交');
          db.prepare('DELETE FROM submission_answers WHERE activity_id=? AND submission_id=?').run(
            id,
            String(row.id),
          );
          if (fault === 'missing-nonwinner')
            db.prepare('DELETE FROM submissions WHERE activity_id=? AND id=?').run(
              id,
              String(row.id),
            );
        });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
