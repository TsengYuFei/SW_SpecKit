import { randomUUID } from 'node:crypto';
import { createPersistenceFixture } from './persistence.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';
import {
  createWritebackWorker,
  type WorkerOptions,
} from '../../backend/src/google/writeback-worker.js';
import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
export function workerFixture(
  options: { active?: boolean; checkpoint?: WorkerOptions['checkpoint'] } = {},
) {
  const p = createPersistenceFixture();
  let grid = sampleSheet(17),
    clock = 10000,
    authorized = true;
  const activity = p.connection.transaction(() => {
    p.accounts.upsert({
      accountId: 'test-owner-a',
      displayEmail: 'a@example.invalid',
      displayName: 'A',
    });
    const activity = p.activities.create({
      ownerAccountId: 'test-owner-a',
      groupCount: 2,
      source: {
        spreadsheetId: 'source-one',
        spreadsheetTitle: '教材',
        sheet: grid,
        questions: parseGuidedNotes([grid]),
      },
    });
    const participant = p.participation.participant('a'.repeat(64));
    p.participation.join(
      activity.id,
      p.activities.groups(activity.id)[0]!.id,
      participant.id,
      '測試組',
    );
    p.activities.start(activity.id, 'test-owner-a');
    const question = activity.source.questions[0]!;
    p.participation.submit(
      activity.id,
      participant.id,
      question.id,
      randomUUID(),
      Object.fromEntries(
        question.items.map((item, index) => [item.id, index === 0 ? '=SUM(A1)' : '安全答案']),
      ),
    );
    if (!options.active) {
      p.connection.database
        .prepare("UPDATE activities SET phase='ended',ended_at=? WHERE id=?")
        .run(clock, activity.id);
      p.writebacks.createForEnded(activity.id);
    }
    return activity;
  });
  if (!options.active)
    p.connection.database
      .prepare('UPDATE writeback_question_states SET next_attempt_at=?')
      .run(clock);
  const writes: unknown[] = [];
  const gateway: GoogleGateway = {
    authorizationUrl: () => '',
    exchange: async () => ({}),
    read: async () => {
      throw new AppError('MAPPING_AMBIGUOUS');
    },
    readSheetById: async (_id, sheetId) => {
      if (sheetId !== 17) throw new AppError('SOURCE_CONFLICT');
      return structuredClone(grid);
    },
    write: async (_id, _credentials, updates) => {
      writes.push(structuredClone(updates));
      for (const { target, answer } of updates) {
        grid.rows[target.rowIndex] ??= [];
        grid.rows[target.rowIndex]![target.columnIndex] = {
          userEnteredValue: { stringValue: answer },
        };
      }
    },
  };
  const credentials = {};
  const grant = (owner: string) => {
    if (!authorized || owner !== 'test-owner-a') throw new AppError('GOOGLE_AUTH_REQUIRED');
    return { credentials, valid: () => authorized };
  };
  let worker = createWritebackWorker(p, gateway, grant, {
    automatic: false,
    clock: () => clock,
    checkpoint: options.checkpoint,
  });
  const jobId = () => String(p.writebacks.getForActivity(activity.id)!.id);
  return {
    p,
    activity,
    gateway,
    writes,
    grant,
    get worker() {
      return worker;
    },
    get grid() {
      return grid;
    },
    set grid(value) {
      grid = value;
    },
    get authorized() {
      return authorized;
    },
    set authorized(value) {
      authorized = value;
    },
    advance(ms: number) {
      clock += ms;
    },
    row: () => p.writebacks.questions(jobId())[0]!,
    jobId,
    async restart() {
      await worker.stop();
      worker = createWritebackWorker(p, gateway, grant, { automatic: false, clock: () => clock });
    },
    async close() {
      await worker.stop();
      p.close();
    },
  };
}
