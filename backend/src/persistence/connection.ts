import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError, normalizeError } from '../security/safe-errors.js';
import { createLogger } from '../security/logger.js';
import { migrate } from './migrate.js';

export function openDatabase(filePath: string, options: { readOnly?: boolean } = {}) {
  if (!isAbsolute(filePath) || /^(?:\\\\|\/\/)/.test(filePath)) throw new AppError('INVALID_INPUT');
  let database: DatabaseSync;
  try {
    const existed = existsSync(filePath);
    if (existed && statSync(filePath).size === 0) throw new AppError('STORAGE_CORRUPT');
    mkdirSync(dirname(filePath), { recursive: true });
    database = new DatabaseSync(filePath, { readOnly: options.readOnly ?? false });
    try {
      database.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON');
      if (database.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
        throw new AppError('STORAGE_CORRUPT');
      migrate(database, existed);
      if (database.prepare('PRAGMA journal_mode=WAL').get()?.journal_mode !== 'wal')
        throw new AppError('STORAGE_UNAVAILABLE');
      database.exec('PRAGMA synchronous=FULL');
      if (
        database.prepare('PRAGMA synchronous').get()?.synchronous !== 2 ||
        database.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1 ||
        database.prepare('PRAGMA busy_timeout').get()?.timeout !== 2000 ||
        database.prepare('PRAGMA foreign_key_check').all().length
      )
        throw new AppError('STORAGE_CORRUPT');
      const slots = database.prepare('SELECT slot,current_activity_id FROM runtime_state').all();
      const live = database
        .prepare("SELECT id FROM activities WHERE phase IN ('waiting','active')")
        .all();
      if (
        slots.length !== 1 ||
        slots[0]!.slot !== 1 ||
        live.length > 1 ||
        (live.length === 1 && slots[0]!.current_activity_id !== live[0]!.id)
      )
        throw new AppError('STORAGE_CORRUPT');
      // A readable database is insufficient: verify that confirmed mutations can be saved.
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(
          'UPDATE runtime_state SET current_activity_id=current_activity_id WHERE slot=1',
        );
      } finally {
        database.exec('ROLLBACK');
      }
    } catch (error) {
      database.close();
      throw error;
    }
  } catch (error) {
    throw error instanceof AppError ? error : normalizeError(error);
  }
  let inTransaction = false;
  let inReadSnapshot = false;
  let closed = false;
  let hooks: (() => void)[] = [];
  const log = createLogger();
  return {
    database,
    filePath,
    get inTransaction() {
      return inTransaction;
    },
    requireTransaction() {
      if (!inTransaction) throw new AppError('INTERNAL_ERROR');
    },
    afterCommit(action: () => void) {
      if (!inTransaction) throw new AppError('INTERNAL_ERROR');
      hooks.push(action);
    },
    readSnapshot<T>(action: () => T): T {
      if (closed || inTransaction || inReadSnapshot) throw new AppError('INTERNAL_ERROR');
      const queryOnly = database.prepare('PRAGMA query_only').get()!.query_only;
      let began = false;
      inReadSnapshot = true;
      try {
        database.exec('PRAGMA query_only=ON');
        database.exec('BEGIN DEFERRED');
        began = true;
        const result = action();
        if (result instanceof Promise) {
          // Reject asynchronous callbacks, while consuming a rejection without logging its payload.
          void result.catch(() => undefined);
          throw new AppError('INTERNAL_ERROR');
        }
        if (
          result !== null &&
          (typeof result === 'object' || typeof result === 'function') &&
          'then' in result &&
          typeof result.then === 'function'
        )
          throw new AppError('INTERNAL_ERROR');
        database.exec('COMMIT');
        began = false;
        return result;
      } catch (error) {
        if (began) {
          try {
            database.exec('ROLLBACK');
          } catch {
            /* Preserve the original safe failure. */
          }
        }
        throw normalizeError(error);
      } finally {
        try {
          database.exec(queryOnly === 1 ? 'PRAGMA query_only=ON' : 'PRAGMA query_only=OFF');
        } finally {
          inReadSnapshot = false;
        }
      }
    },
    transaction<T>(action: () => T): T {
      if (inTransaction || inReadSnapshot) throw new AppError('INTERNAL_ERROR');
      try {
        database.exec('BEGIN IMMEDIATE');
        inTransaction = true;
        const result = action();
        if (result instanceof Promise) throw new AppError('INTERNAL_ERROR');
        database.exec('COMMIT');
        inTransaction = false;
        const committed = hooks;
        hooks = [];
        for (const hook of committed) {
          try {
            hook();
          } catch {
            log({ event: 'request_failed', code: 'INTERNAL_ERROR' });
          }
        }
        return result;
      } catch (error) {
        if (inTransaction) {
          try {
            database.exec('ROLLBACK');
          } catch {
            /* Preserve the original safe failure. */
          }
        }
        inTransaction = false;
        hooks = [];
        throw normalizeError(error);
      }
    },
    close() {
      if (closed) return;
      if (inTransaction || inReadSnapshot) throw new AppError('STORAGE_UNAVAILABLE');
      try {
        database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } finally {
        database.close();
        closed = true;
      }
    },
  };
}
export type DatabaseConnection = ReturnType<typeof openDatabase>;
