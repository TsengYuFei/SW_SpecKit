import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorCodeSchema } from '@classroom/shared/schemas/common';
import type { DatabaseConnection } from './connection.js';
import type { ActivityRepository } from './activity-repository.js';
import { AppError } from '../security/safe-errors.js';

const status = z.enum(['writing', 'pending', 'verified', 'conflict', 'failed']);
const reason = z
  .union([errorCodeSchema, z.enum(['QUEUED', 'VERIFICATION_PAUSED', 'AUTO_RETRY_EXHAUSTED'])])
  .nullable();
const state = z.strictObject({
  status,
  safeErrorCode: reason,
  retryCycle: z.number().int().nonnegative().safe(),
  writeAttemptCount: z.number().int().min(0).max(3),
  verificationFailureCount: z.number().int().min(0).max(4),
  nextAttemptAt: z.number().int().safe().nullable(),
});
export function createWritebackRepository(
  connection: DatabaseConnection,
  activities: ActivityRepository,
) {
  const db = connection.database;
  function getForActivity(activityId: string) {
    return db.prepare('SELECT * FROM writeback_jobs WHERE activity_id=?').get(activityId);
  }
  return {
    getForActivity,
    questions(jobId: string) {
      return db
        .prepare('SELECT * FROM writeback_question_states WHERE job_id=? ORDER BY question_id')
        .all(jobId);
    },
    createForEnded(activityId: string) {
      connection.requireTransaction();
      const activity = activities.require(activityId);
      if (activity.phase !== 'ended') throw new AppError('INVALID_PHASE');
      const prior = getForActivity(activityId);
      if (prior) return prior;
      const jobId = randomUUID();
      const now = Date.now();
      const winners = activity.source.questions.map((question) => ({
        question,
        submission: db
          .prepare(
            'SELECT id FROM submissions WHERE activity_id=? AND question_id=? ORDER BY sequence LIMIT 1',
          )
          .get(activityId, question.id),
      }));
      const hasWinners = winners.some((entry) => entry.submission);
      db.prepare('INSERT INTO writeback_jobs VALUES(?,?,?,?,?,?,?)').run(
        jobId,
        activityId,
        activity.ownerAccountId,
        hasWinners ? 'pending' : 'verified',
        hasWinners ? 'QUEUED' : null,
        now,
        now,
      );
      for (const { question, submission } of winners) {
        db.prepare('INSERT INTO results VALUES(?,?,?)').run(
          activityId,
          question.id,
          submission ? String(submission.id) : null,
        );
        if (!submission) continue;
        const answers = Object.fromEntries(
          db
            .prepare(
              'SELECT item_id,answer FROM submission_answers WHERE activity_id=? AND submission_id=?',
            )
            .all(activityId, String(submission.id))
            .map((row) => [String(row.item_id), String(row.answer)]),
        );
        db.prepare(
          `INSERT INTO writeback_question_states(job_id,activity_id,question_id,status,expected_answers_json,target_snapshot_json,next_attempt_at,updated_at)
          VALUES(?,?,?,'pending',?,?,?,?)`,
        ).run(
          jobId,
          activityId,
          question.id,
          JSON.stringify(answers),
          JSON.stringify(question),
          now,
          now,
        );
      }
      return getForActivity(activityId)!;
    },
    updateQuestion(
      jobId: string,
      questionId: string,
      expectedCycle: number,
      input: z.input<typeof state>,
    ) {
      connection.requireTransaction();
      const value = state.parse(input);
      const result = db
        .prepare(
          `UPDATE writeback_question_states SET status=?,safe_error_code=?,retry_cycle=?,write_attempt_count=?,
        verification_failure_count=?,next_attempt_at=?,updated_at=? WHERE job_id=? AND question_id=? AND retry_cycle=?`,
        )
        .run(
          value.status,
          value.safeErrorCode,
          value.retryCycle,
          value.writeAttemptCount,
          value.verificationFailureCount,
          value.nextAttemptAt,
          Date.now(),
          jobId,
          questionId,
          expectedCycle,
        );
      if (result.changes !== 1) throw new AppError('REQUEST_CONFLICT');
      const statuses = db
        .prepare('SELECT status FROM writeback_question_states WHERE job_id=?')
        .all(jobId)
        .map((row) => String(row.status));
      const overall =
        ['writing', 'pending', 'conflict', 'failed'].find((candidate) =>
          statuses.includes(candidate),
        ) ?? 'verified';
      db.prepare('UPDATE writeback_jobs SET status=?,updated_at=? WHERE id=?').run(
        overall,
        Date.now(),
        jobId,
      );
    },
    recordAttempt(
      jobId: string,
      questionId: string,
      input: {
        kind: 'precheck' | 'write' | 'verify';
        retryCycle: number;
        outcome: 'started' | 'success' | 'failed' | 'unknown';
        safeErrorCode?: string | null;
      },
    ) {
      connection.requireTransaction();
      const value = z
        .strictObject({
          kind: z.enum(['precheck', 'write', 'verify']),
          retryCycle: z.number().int().nonnegative().safe(),
          outcome: z.enum(['started', 'success', 'failed', 'unknown']),
          safeErrorCode: reason.optional(),
        })
        .parse(input);
      const current = db
        .prepare(
          'SELECT retry_cycle FROM writeback_question_states WHERE job_id=? AND question_id=?',
        )
        .get(jobId, questionId);
      if (current?.retry_cycle !== value.retryCycle) throw new AppError('REQUEST_CONFLICT');
      const ordinal = Number(
        db
          .prepare(
            'SELECT COALESCE(MAX(ordinal),0)+1 AS ordinal FROM writeback_attempts WHERE job_id=? AND question_id=?',
          )
          .get(jobId, questionId)!.ordinal,
      );
      const id = randomUUID();
      const now = Date.now();
      db.prepare('INSERT INTO writeback_attempts VALUES(?,?,?,?,?,?,?,?,?,?)').run(
        id,
        jobId,
        questionId,
        ordinal,
        value.retryCycle,
        value.kind,
        now,
        value.outcome === 'started' ? null : now,
        value.outcome,
        value.safeErrorCode ?? null,
      );
      return { id, ordinal };
    },
  };
}
