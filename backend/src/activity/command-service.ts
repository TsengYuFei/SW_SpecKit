import type { DatabaseConnection } from '../persistence/connection.js';
import {
  businessJson,
  type ActivityCommand,
  type AccountCommand,
  type ReceiptOutcome,
  createReceiptRepository,
} from '../persistence/receipt-repository.js';
import { AppError, normalizeError } from '../security/safe-errors.js';

export function createCommandService(connection: DatabaseConnection) {
  const receipts = createReceiptRepository(connection);
  function execute<T>(command: ActivityCommand | AccountCommand, mutate: () => T): T {
    const fingerprint = receipts.fingerprint(command.payload);
    const prior = receipts.get(command);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError('REQUEST_CONFLICT');
      if (!prior.outcome.ok) throw new AppError(prior.outcome.error);
      return prior.outcome.data as T;
    }
    try {
      return connection.transaction(() => {
        const result = mutate();
        if (result instanceof Promise) throw new AppError('INTERNAL_ERROR');
        const data = JSON.parse(businessJson(result)) as T;
        receipts.save(command, fingerprint, { ok: true, data });
        return data;
      });
    } catch (error) {
      const safe = normalizeError(error);
      // The failed mutation has already rolled back. Cache only deterministic business rejections.
      const transient = [
        'UNAUTHORIZED',
        'FORBIDDEN',
        'GOOGLE_AUTH_REQUIRED',
        'STORAGE_UNAVAILABLE',
        'STORAGE_CORRUPT',
        'INTERNAL_ERROR',
        'RATE_LIMITED',
      ];
      if (!transient.includes(safe.code)) {
        try {
          connection.transaction(() => {
            if (!receipts.get(command)) {
              const outcome: ReceiptOutcome = { ok: false, error: safe.code };
              receipts.save(command, fingerprint, outcome);
            }
          });
        } catch {
          /* Preserve the original rejection; a storage failure never becomes success. */
        }
      }
      throw safe;
    }
  }
  return { execute };
}
