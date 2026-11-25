import { AppError } from '../security/safe-errors.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import { persistentWriteback } from '../persistence/writeback-projection.js';
import type { WritebackWorker } from './writeback-worker.js';
export function createDurableWritebackService(
  p: RuntimePersistence,
  worker: WritebackWorker,
  authorize: (sessionId: string, id: string) => { accountId: string },
) {
  function get(sessionId: string, id: string) {
    authorize(sessionId, id);
    if (worker.halted) throw new AppError('STORAGE_UNAVAILABLE');
    const value = persistentWriteback(p, id);
    if (!value) throw new AppError('INVALID_PHASE');
    return value;
  }
  return {
    get,
    async recover(sessionId: string, id: string, requestId: string, kind: 'verify' | 'retry') {
      const auth = authorize(sessionId, id),
        snapshot = get(sessionId, id);
      const command = {
        activityId: id,
        actorKey: 'teacher:' + auth.accountId,
        event: 'writeback:' + kind,
        requestId,
        payload: { jobId: snapshot.operationId },
      };
      if (p.receipts.get(command)) {
        p.commands.execute(command, () => null);
        return get(sessionId, id);
      }
      if (
        !snapshot.questions.some(
          (question) => question.status === 'pending' || question.status === 'failed',
        )
      )
        throw new AppError('INVALID_PHASE');
      await worker.verify(snapshot.operationId);
      authorize(sessionId, id);
      p.commands.execute(command, () => {
        if (kind === 'retry') {
          const eligible = p.writebacks
            .questions(snapshot.operationId)
            .filter(
              (row) =>
                (row.status === 'failed' || row.status === 'pending') &&
                ['WRITE_PENDING', 'AUTO_RETRY_EXHAUSTED'].includes(String(row.safe_error_code)),
            );
          if (!eligible.length) throw new AppError('WRITE_PENDING');
          for (const row of eligible)
            p.writebacks.updateQuestion(
              snapshot.operationId,
              String(row.question_id),
              Number(row.retry_cycle),
              {
                status: 'pending',
                safeErrorCode: 'QUEUED',
                retryCycle: Number(row.retry_cycle) + 1,
                writeAttemptCount: 0,
                verificationFailureCount: 0,
                nextAttemptAt: Date.now(),
              },
            );
        }
        return { jobId: snapshot.operationId, action: kind };
      });
      if (kind === 'retry') worker.wake();
      return get(sessionId, id);
    },
  };
}
export type DurableWritebackService = ReturnType<typeof createDurableWritebackService>;
