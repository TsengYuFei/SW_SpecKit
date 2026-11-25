import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { gridSheetSchema, questionSchema } from '@classroom/shared/schemas/source';
import type { DatabaseConnection } from './connection.js';
import { AppError } from '../security/safe-errors.js';

export const durableSourceSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  spreadsheetTitle: z.string(),
  sheet: gridSheetSchema,
  questions: z.array(questionSchema).min(1),
});
export type DurableSource = z.infer<typeof durableSourceSchema>;
export function durableSourceFingerprint(source: DurableSource) {
  return createHash('sha256')
    .update(JSON.stringify(durableSourceSchema.parse(source)))
    .digest('hex');
}
export function createActivityRepository(connection: DatabaseConnection, maxGroups: number) {
  const db = connection.database;
  function requireActivity(id: string) {
    const row = db.prepare('SELECT * FROM activities WHERE id=?').get(z.uuid().parse(id));
    if (!row) throw new AppError('ACTIVITY_UNAVAILABLE');
    let source: DurableSource;
    try {
      source = durableSourceSchema.parse(JSON.parse(String(row.source_snapshot_json)));
    } catch {
      throw new AppError('STORAGE_CORRUPT');
    }
    return {
      id: String(row.id),
      ownerAccountId: String(row.owner_account_id),
      phase: z.enum(['waiting', 'active', 'ended']).parse(row.phase),
      groupCount: Number(row.group_count),
      revision: Number(row.revision),
      nextSequence: Number(row.next_sequence),
      createdAt: Number(row.created_at),
      startedAt: row.started_at === null ? null : Number(row.started_at),
      endedAt: row.ended_at === null ? null : Number(row.ended_at),
      source,
      fingerprint: String(row.source_fingerprint),
    };
  }
  function getOwned(id: string, accountId: string) {
    const activity = requireActivity(id);
    if (activity.ownerAccountId !== accountId) throw new AppError('ACTIVITY_UNAVAILABLE');
    return activity;
  }
  function groups(activityId: string) {
    return db
      .prepare('SELECT * FROM activity_groups WHERE activity_id=? ORDER BY ordinal')
      .all(activityId)
      .map((row) => ({
        id: String(row.id),
        ordinal: Number(row.ordinal),
        participantId: row.participant_id === null ? null : String(row.participant_id),
        name: row.name === null ? null : String(row.name),
      }));
  }
  return {
    require: requireActivity,
    getOwned,
    groups,
    current() {
      const row = db.prepare('SELECT current_activity_id FROM runtime_state WHERE slot=1').get();
      return row?.current_activity_id ? requireActivity(String(row.current_activity_id)) : null;
    },
    create(input: { ownerAccountId: string; groupCount: number; source: DurableSource }) {
      connection.requireTransaction();
      const groupCount = z.number().int().min(1).max(maxGroups).parse(input.groupCount);
      const source = durableSourceSchema.parse(input.source);
      if (
        source.questions.some((question) =>
          question.items.some((item) => item.target.sheetId !== source.sheet.sheetId),
        )
      )
        throw new AppError('SOURCE_CONFLICT');
      const current = db
        .prepare(
          `SELECT a.phase,j.status FROM runtime_state r LEFT JOIN activities a ON a.id=r.current_activity_id
        LEFT JOIN writeback_jobs j ON j.activity_id=a.id WHERE r.slot=1`,
        )
        .get();
      if (
        db
          .prepare("SELECT 1 FROM writeback_jobs WHERE status IN ('pending','writing') LIMIT 1")
          .get() ||
        (current?.phase &&
          (current.phase !== 'ended' ||
            current.status === null ||
            current.status === 'writing' ||
            current.status === 'pending'))
      )
        throw new AppError('SYSTEM_BUSY');
      const id = randomUUID();
      const now = Date.now();
      const snapshot = JSON.stringify(source);
      const fingerprint = durableSourceFingerprint(source);
      db.prepare(
        `INSERT INTO activities(id,owner_account_id,phase,created_at,group_count,spreadsheet_id,spreadsheet_title,
        source_sheet_id,source_sheet_title,source_snapshot_json,source_fingerprint,source_confirmed_at)
        VALUES(?,?,'waiting',?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        input.ownerAccountId,
        now,
        groupCount,
        source.spreadsheetId,
        source.spreadsheetTitle,
        source.sheet.sheetId,
        source.sheet.title,
        snapshot,
        fingerprint,
        now,
      );
      for (const [index, question] of source.questions.entries()) {
        db.prepare('INSERT INTO questions VALUES(?,?,?,?,?)').run(
          id,
          question.id,
          question.displayNumber,
          question.kind,
          index + 1,
        );
        for (const [ordinal, item] of question.items.entries()) {
          db.prepare('INSERT INTO question_items VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
            id,
            question.id,
            item.id,
            ordinal + 1,
            item.label,
            item.prompt,
            item.target.sheetId,
            item.target.rowIndex,
            item.target.columnIndex,
            JSON.stringify(item.baselineValue),
            JSON.stringify(item.target.mergeRange),
          );
        }
      }
      for (let ordinal = 1; ordinal <= groupCount; ordinal++)
        db.prepare('INSERT INTO activity_groups(activity_id,id,ordinal) VALUES(?,?,?)').run(
          id,
          randomUUID(),
          ordinal,
        );
      db.prepare('UPDATE runtime_state SET current_activity_id=? WHERE slot=1').run(id);
      return requireActivity(id);
    },
    start(id: string, accountId: string) {
      connection.requireTransaction();
      const activity = getOwned(id, accountId);
      if (activity.phase !== 'waiting') throw new AppError('INVALID_PHASE');
      db.prepare(
        "UPDATE activities SET phase='active',started_at=?,revision=revision+1 WHERE id=?",
      ).run(Date.now(), id);
      return requireActivity(id);
    },
  };
}
export type ActivityRepository = ReturnType<typeof createActivityRepository>;
