import { writebackSchema, type Writeback } from '@classroom/shared/schemas/writeback';
import { safeError, AppError } from '../security/safe-errors.js';
import { errorCodeSchema } from '@classroom/shared/schemas/common';
import type { RuntimePersistence } from './repositories.js';
export function persistentWriteback(
  persistence: RuntimePersistence,
  activityId: string,
): Writeback | null {
  const job = persistence.writebacks.getForActivity(activityId);
  if (!job) return null;
  try {
    return writebackSchema.parse({
      operationId: job.id,
      activityId,
      status: job.status,
      reasonCode: job.reason_code ?? undefined,
      questions: persistence.writebacks.questions(String(job.id)).map((row) => {
        const expectedAnswers = JSON.parse(String(row.expected_answers_json)) as Record<
          string,
          string
        >;
        const code = errorCodeSchema.safeParse(row.safe_error_code);
        return {
          questionId: row.question_id,
          status: row.status,
          expectedAnswers,
          itemStatuses: Object.fromEntries(
            Object.keys(expectedAnswers).map((id) => [id, row.status]),
          ),
          retryCycle: row.retry_cycle,
          writeAttemptCount: row.write_attempt_count,
          verificationFailureCount: row.verification_failure_count,
          nextAttemptAt: row.next_attempt_at,
          reasonCode: row.safe_error_code ?? undefined,
          ...(code.success ? { error: safeError(new AppError(code.data)) } : {}),
        };
      }),
    });
  } catch {
    throw new AppError('STORAGE_CORRUPT');
  }
}
