import { AppError } from '../security/safe-errors.js';
import { EXPORT_LIMITS } from './limits.js';
export class ExportGateError extends AppError {
  constructor(
    code: 'EXPORT_BUSY' | 'RATE_LIMITED',
    readonly retryAfter: number,
  ) {
    super(code);
  }
}
export function createExportGate(clock = () => performance.now()) {
  const windows = new Map<string, { start: number; attempts: number }>();
  let busy = false;
  return {
    acquire(session: string) {
      const now = clock();
      for (const [key, value] of windows)
        if (now - value.start >= EXPORT_LIMITS.windowMs) windows.delete(key);
      if (busy) throw new ExportGateError('EXPORT_BUSY', 1);
      const prior = windows.get(session);
      if (prior && prior.attempts >= EXPORT_LIMITS.attempts)
        throw new ExportGateError(
          'RATE_LIMITED',
          Math.max(1, Math.ceil((prior.start + EXPORT_LIMITS.windowMs - now) / 1000)),
        );
      windows.set(session, { start: prior?.start ?? now, attempts: (prior?.attempts ?? 0) + 1 });
      busy = true;
      let released = false;
      return {
        check(signal?: AbortSignal) {
          if (released || signal?.aborted || clock() - now >= EXPORT_LIMITS.deadlineMs)
            throw new ExportGateError('EXPORT_BUSY', 1);
        },
        release() {
          if (!released) {
            busy = false;
            released = true;
          }
        },
      };
    },
  };
}
