import { z } from 'zod';
import { deriveAnswerOrder } from '@classroom/shared/projections/answer-order';
import type { RuntimePersistence } from './repositories.js';
import { durableSourceSchema, durableSourceFingerprint } from './activity-repository.js';
import { parseGuidedNotes } from '../google/guided-notes-parser.js';
import { AppError, normalizeError } from '../security/safe-errors.js';
import { EXPORT_LIMITS, within } from '../export/limits.js';

export function exportMetadata(p: RuntimePersistence, id: string, owner: string) {
  const db = p.connection.database;
  const row = db
    .prepare(
      `SELECT phase,length(CAST(source_snapshot_json AS BLOB)) AS bytes FROM activities WHERE id=? AND owner_account_id=?`,
    )
    .get(id, owner);
  if (!row) throw new AppError('ACTIVITY_UNAVAILABLE');
  if (row.phase !== 'ended') throw new AppError('INVALID_PHASE');
  const answers = db
    .prepare(
      'SELECT COALESCE(SUM(length(CAST(answer AS BLOB))),0) AS bytes FROM submission_answers WHERE activity_id=?',
    )
    .get(id)!;
  within(Number(row.bytes) + Number(answers.bytes), EXPORT_LIMITS.inputBytes);
}
export function readExportSnapshot(
  p: RuntimePersistence,
  id: string,
  owner: string,
  exportedAt: number,
) {
  return p.connection.readSnapshot(() => {
    exportMetadata(p, id, owner);
    const db = p.connection.database;
    try {
      const row = db
        .prepare(
          `SELECT id,phase,revision,group_count,next_sequence,spreadsheet_title,source_snapshot_json,source_fingerprint FROM activities WHERE id=? AND owner_account_id=?`,
        )
        .get(id, owner)!;
      const source = durableSourceSchema.parse(JSON.parse(String(row.source_snapshot_json)));
      if (
        source.spreadsheetTitle !== row.spreadsheet_title ||
        durableSourceFingerprint(source) !== row.source_fingerprint ||
        JSON.stringify(parseGuidedNotes([source.sheet])) !== JSON.stringify(source.questions)
      )
        throw new AppError('STORAGE_CORRUPT');
      const normalized = db
        .prepare('SELECT * FROM questions WHERE activity_id=? ORDER BY ordinal')
        .all(id)
        .map((q, qi) => {
          if (q.ordinal !== qi + 1) throw new AppError('STORAGE_CORRUPT');
          return {
            id: q.question_id,
            displayNumber: q.display_number,
            kind: q.kind,
            items: db
              .prepare(
                'SELECT * FROM question_items WHERE activity_id=? AND question_id=? ORDER BY ordinal',
              )
              .all(id, String(q.question_id))
              .map((item, i) => {
                if (item.ordinal !== i + 1) throw new AppError('STORAGE_CORRUPT');
                return {
                  id: item.item_id,
                  label: item.label,
                  prompt: item.prompt,
                  target: {
                    sheetId: item.sheet_id,
                    rowIndex: item.row_index,
                    columnIndex: item.column_index,
                    mergeRange: JSON.parse(String(item.merge_json)),
                  },
                  baselineValue: JSON.parse(String(item.baseline_json)),
                };
              }),
          };
        });
      if (JSON.stringify(normalized) !== JSON.stringify(source.questions))
        throw new AppError('STORAGE_CORRUPT');
      const groups = db
        .prepare(
          'SELECT id,ordinal,participant_id,name FROM activity_groups WHERE activity_id=? ORDER BY ordinal',
        )
        .all(id)
        .map((g, i) => {
          if (g.ordinal !== i + 1 || (g.participant_id === null && g.name !== null))
            throw new AppError('STORAGE_CORRUPT');
          return {
            id: g.id,
            ordinal: g.ordinal,
            occupied: g.participant_id !== null,
            name: g.name ?? '',
          };
        });
      const groupCount = z.number().int().positive().safe().parse(row.group_count);
      if (groups.length !== groupCount) throw new AppError('STORAGE_CORRUPT');
      const submissions = db
        .prepare(
          'SELECT id,group_id,question_id,request_id,received_at,sequence FROM submissions WHERE activity_id=? ORDER BY sequence',
        )
        .all(id)
        .map((s) => {
          z.uuid().parse(s.request_id);
          z.number().finite().parse(s.received_at);
          const answers = db
            .prepare(
              'SELECT question_id,item_id,answer FROM submission_answers WHERE activity_id=? AND submission_id=?',
            )
            .all(id, String(s.id));
          if (answers.some((a) => a.question_id !== s.question_id))
            throw new AppError('STORAGE_CORRUPT');
          return {
            id: s.id,
            groupId: s.group_id,
            questionId: s.question_id,
            sequence: s.sequence,
            answers: Object.fromEntries(answers.map((a) => [String(a.item_id), a.answer])),
          };
        });
      const order = deriveAnswerOrder({ questions: source.questions, groups, submissions });
      const nextSequence = z.number().int().positive().safe().parse(row.next_sequence);
      if (nextSequence !== order.all.length + 1) throw new AppError('STORAGE_CORRUPT');
      const results = db
        .prepare('SELECT question_id,winner_submission_id FROM results WHERE activity_id=?')
        .all(id);
      if (
        results.length !== order.questions.length ||
        order.questions.some(
          (q) =>
            results.find((r) => r.question_id === q.questionId)?.winner_submission_id !==
            (q.entries[0]?.submissionId ?? null),
        )
      )
        throw new AppError('STORAGE_CORRUPT');
      return {
        activityId: z.uuid().parse(row.id),
        activityName: source.spreadsheetTitle,
        phase: 'ended' as const,
        revision: z.number().int().nonnegative().safe().parse(row.revision),
        groupCount,
        nextSequence,
        order,
        exportedAt,
      };
    } catch (error) {
      if (
        error instanceof AppError &&
        ['STORAGE_CORRUPT', 'STORAGE_UNAVAILABLE', 'EXPORT_TOO_LARGE'].includes(error.code)
      )
        throw error;
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ERR_SQLITE_ERROR'
      )
        throw normalizeError(error);
      throw new AppError('STORAGE_CORRUPT');
    }
  });
}
