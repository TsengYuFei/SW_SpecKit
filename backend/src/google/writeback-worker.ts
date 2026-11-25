import { questionSchema } from '@classroom/shared/schemas/source';
import type { RuntimePersistence } from '../persistence/repositories.js';
import type { GoogleGateway, TokenSet } from './sheets-client.js';
import { googleError } from './errors.js';
import { classifyWriteback } from './writeback-check.js';
import { AppError } from '../security/safe-errors.js';
import { createLogger } from '../security/logger.js';

type Row = ReturnType<RuntimePersistence['writebacks']['questions']>[number];
type State = Parameters<RuntimePersistence['writebacks']['updateQuestion']>[3];
type Grant = { credentials: TokenSet; valid: () => boolean };
export interface WorkerOptions {
  clock?: () => number;
  automatic?: boolean;
  changed?: (activityId: string) => void;
  checkpoint?: (point: 'write-committed' | 'write-sent' | 'readback-complete') => Promise<void>;
}
export function createWritebackWorker(
  p: RuntimePersistence,
  gateway: GoogleGateway,
  credentialsForOwner: (owner: string) => Grant,
  options: WorkerOptions = {},
) {
  const now = options.clock ?? (() => Date.now());
  const db = p.connection.database;
  let running: Promise<void> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    closed = false,
    halted = false;
  const log = createLogger();
  const job = (id: string) => {
    const value = db.prepare('SELECT * FROM writeback_jobs WHERE id=?').get(id);
    if (!value) throw new AppError('ACTIVITY_UNAVAILABLE');
    return value;
  };
  const current = (row: Row) =>
    p.writebacks
      .questions(String(row.job_id))
      .find((value) => value.question_id === row.question_id)!;
  function state(row: Row): State {
    return {
      status: row.status as State['status'],
      safeErrorCode: row.safe_error_code as State['safeErrorCode'],
      retryCycle: Number(row.retry_cycle),
      writeAttemptCount: Number(row.write_attempt_count),
      verificationFailureCount: Number(row.verification_failure_count),
      nextAttemptAt: row.next_attempt_at === null ? null : Number(row.next_attempt_at),
    };
  }
  function save(
    row: Row,
    patch: Partial<State>,
    finish?: { id: string; outcome: 'success' | 'failed' | 'unknown'; code?: string },
  ) {
    p.connection.transaction(() => {
      if (finish) p.writebacks.finishAttempt(finish.id, finish.outcome, finish.code ?? null);
      p.writebacks.updateQuestion(
        String(row.job_id),
        String(row.question_id),
        Number(row.retry_cycle),
        { ...state(current(row)), ...patch },
      );
    });
    options.changed?.(String(row.activity_id));
    return current(row);
  }
  function assertGrant(grant: Grant) {
    if (closed || !grant.valid()) throw new AppError('GOOGLE_AUTH_REQUIRED');
  }
  function authPending(row: Row, previous?: Grant) {
    let next: number | null = null;
    try {
      const replacement = credentialsForOwner(String(job(String(row.job_id)).owner_account_id));
      if (previous && replacement.valid() && replacement.credentials !== previous.credentials)
        next = now();
    } catch {
      /* Original owner must authorize. */
    }
    return save(row, {
      status: 'pending',
      safeErrorCode: 'GOOGLE_AUTH_REQUIRED',
      nextAttemptAt: next,
    });
  }
  async function inspect(row: Row, grant: Grant, kind: 'precheck' | 'verify') {
    const parent = job(String(row.job_id)),
      activity = p.activities.require(String(parent.activity_id));
    if (activity.phase !== 'ended' || activity.ownerAccountId !== parent.owner_account_id)
      throw new AppError('STORAGE_CORRUPT');
    const original = questionSchema.parse(JSON.parse(String(row.target_snapshot_json)));
    const expected = JSON.parse(String(row.expected_answers_json)) as Record<string, string>;
    const attempt = p.connection.transaction(() =>
      p.writebacks.recordAttempt(String(row.job_id), String(row.question_id), {
        kind,
        retryCycle: Number(row.retry_cycle),
        outcome: 'started',
        startedAt: now(),
      }),
    );
    try {
      assertGrant(grant);
      if (!gateway.readSheetById) throw new AppError('GOOGLE_ERROR');
      const sheet = await gateway.readSheetById(
        activity.source.spreadsheetId,
        activity.source.sheet.sheetId,
        grant.credentials,
      );
      assertGrant(grant);
      const result = classifyWriteback(original, expected, sheet);
      if (kind === 'verify') await options.checkpoint?.('readback-complete');
      save(row, { verificationFailureCount: 0 }, { id: attempt.id, outcome: 'success' });
      return result;
    } catch (error) {
      if (closed) return null;
      const safe = googleError(error);
      if (['STORAGE_UNAVAILABLE', 'STORAGE_CORRUPT'].includes(safe.code)) throw safe;
      if (safe.code === 'GOOGLE_AUTH_REQUIRED') {
        p.connection.transaction(() => p.writebacks.finishAttempt(attempt.id, 'failed', safe.code));
        authPending(row, grant);
        return null;
      }
      const conflict = ['MAPPING_AMBIGUOUS', 'SOURCE_CONFLICT', 'SOURCE_UNSUPPORTED'].includes(
        safe.code,
      );
      const transient = ['NETWORK_ERROR', 'GOOGLE_ERROR', 'RATE_LIMITED'].includes(safe.code);
      const count = Math.min(4, Number(current(row).verification_failure_count) + 1);
      save(
        row,
        conflict
          ? { status: 'conflict', safeErrorCode: 'SOURCE_CONFLICT', nextAttemptAt: null }
          : transient
            ? {
                status: 'pending',
                verificationFailureCount: count,
                safeErrorCode: count === 4 ? 'VERIFICATION_PAUSED' : safe.code,
                nextAttemptAt: count === 4 ? null : now() + 1000 * 2 ** (count - 1),
              }
            : { status: 'failed', safeErrorCode: safe.code, nextAttemptAt: null },
        { id: attempt.id, outcome: 'failed', code: safe.code },
      );
      return null;
    }
  }
  function nextWrite(row: Row) {
    const count = Number(row.write_attempt_count);
    if (!count) return now();
    const last = db
      .prepare(
        "SELECT MAX(started_at) AS time FROM writeback_attempts WHERE job_id=? AND question_id=? AND retry_cycle=? AND kind='write'",
      )
      .get(row.job_id!, row.question_id!, row.retry_cycle!);
    return Number(last?.time ?? now()) + (count === 1 ? 2000 : 4000);
  }
  function settle(row: Row, result: 'expected' | 'baseline' | 'conflict', verifyOnly: boolean) {
    if (result === 'expected') {
      save(row, { status: 'verified', safeErrorCode: null, nextAttemptAt: null });
      return true;
    }
    if (result === 'conflict') {
      save(row, { status: 'conflict', safeErrorCode: 'SOURCE_CONFLICT', nextAttemptAt: null });
      return true;
    }
    if (Number(row.write_attempt_count) >= 3) {
      save(row, { status: 'failed', safeErrorCode: 'AUTO_RETRY_EXHAUSTED', nextAttemptAt: null });
      return true;
    }
    if (verifyOnly) {
      save(row, { status: 'pending', safeErrorCode: 'WRITE_PENDING', nextAttemptAt: null });
      return true;
    }
    return false;
  }
  async function processQuestion(initial: Row, verifyOnly = false) {
    let row = current(initial),
      grant: Grant;
    try {
      grant = credentialsForOwner(String(job(String(row.job_id)).owner_account_id));
      assertGrant(grant);
    } catch {
      authPending(row);
      return;
    }
    const result = await inspect(
      row,
      grant,
      verifyOnly || Number(row.write_attempt_count) > 0 ? 'verify' : 'precheck',
    );
    if (result === null || closed) return;
    row = current(row);
    if (settle(row, result, verifyOnly)) return;
    const due = nextWrite(row);
    if (due > now()) {
      save(row, { status: 'pending', safeErrorCode: 'WRITE_PENDING', nextAttemptAt: due });
      return;
    }
    assertGrant(grant);
    const attempt = p.connection.transaction(() => {
      const fresh = current(row);
      if (fresh.status !== 'pending' || fresh.retry_cycle !== row.retry_cycle)
        throw new AppError('REQUEST_CONFLICT');
      p.writebacks.updateQuestion(
        String(row.job_id),
        String(row.question_id),
        Number(row.retry_cycle),
        {
          ...state(fresh),
          status: 'writing',
          writeAttemptCount: Number(fresh.write_attempt_count) + 1,
          nextAttemptAt: null,
          safeErrorCode: null,
        },
      );
      return p.writebacks.recordAttempt(String(row.job_id), String(row.question_id), {
        kind: 'write',
        retryCycle: Number(row.retry_cycle),
        outcome: 'started',
        startedAt: now(),
      });
    });
    options.changed?.(String(row.activity_id));
    await options.checkpoint?.('write-committed');
    if (closed) return;
    try {
      assertGrant(grant);
      const activity = p.activities.require(String(row.activity_id));
      const question = questionSchema.parse(JSON.parse(String(row.target_snapshot_json)));
      const answers = JSON.parse(String(row.expected_answers_json)) as Record<string, string>;
      await gateway.write(
        activity.source.spreadsheetId,
        grant.credentials,
        question.items.map((item) => ({ target: item.target, answer: answers[item.id]! })),
      );
      p.connection.transaction(() => p.writebacks.finishAttempt(attempt.id, 'success'));
    } catch (error) {
      if (closed) return;
      const safe = googleError(error);
      if (['STORAGE_UNAVAILABLE', 'STORAGE_CORRUPT'].includes(safe.code)) throw safe;
      if (safe.code === 'GOOGLE_AUTH_REQUIRED') {
        p.connection.transaction(() => p.writebacks.finishAttempt(attempt.id, 'failed', safe.code));
        authPending(current(row), grant);
        return;
      }
      const definite = [
        'INVALID_INPUT',
        'GOOGLE_AUTH_REQUIRED',
        'GOOGLE_FORBIDDEN',
        'SHEET_NOT_FOUND_OR_INACCESSIBLE',
        'SOURCE_READ_ONLY',
        'RATE_LIMITED',
      ].includes(safe.code);
      save(
        row,
        {
          status: definite ? 'failed' : 'pending',
          safeErrorCode: safe.code,
          nextAttemptAt: definite ? null : nextWrite(current(row)),
        },
        { id: attempt.id, outcome: definite ? 'failed' : 'unknown', code: safe.code },
      );
      if (definite) return;
    }
    await options.checkpoint?.('write-sent');
    if (closed) return;
    const actual = await inspect(current(row), grant, 'verify');
    if (actual === null || closed) return;
    row = current(row);
    if (!settle(row, actual, false))
      save(row, {
        status: 'pending',
        safeErrorCode: 'WRITE_PENDING',
        nextAttemptAt: nextWrite(row),
      });
  }
  function arm() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (closed || halted || options.automatic === false) return;
    try {
      const row = db
        .prepare(
          "SELECT MIN(next_attempt_at) AS due FROM writeback_question_states WHERE status='pending' AND next_attempt_at IS NOT NULL",
        )
        .get();
      if (row?.due !== null && row?.due !== undefined) {
        timer = setTimeout(
          () => wake(),
          Math.min(2147483647, Math.max(0, Number(row.due) - now())),
        );
        timer.unref();
      }
    } catch {
      halted = true;
      log({ event: 'request_failed', code: 'STORAGE_UNAVAILABLE' });
    }
  }
  async function loop() {
    for (;;) {
      if (closed || halted) return;
      const row = db
        .prepare(
          "SELECT q.* FROM writeback_question_states q JOIN writeback_jobs j ON j.id=q.job_id WHERE q.status='pending' AND q.next_attempt_at IS NOT NULL AND q.next_attempt_at<=? ORDER BY q.next_attempt_at,q.job_id,q.question_id LIMIT 1",
        )
        .get(now());
      if (!row) return;
      await processQuestion(row);
    }
  }
  function tick() {
    if (closed || halted) return Promise.resolve();
    if (!running)
      running = Promise.resolve()
        .then(loop)
        .catch(() => {
          halted = true;
          log({ event: 'request_failed', code: 'STORAGE_UNAVAILABLE' });
        })
        .finally(() => {
          running = undefined;
          arm();
        });
    return running;
  }
  function wake() {
    if (options.automatic !== false && !closed && !halted) void tick();
  }
  p.connection.transaction(() => {
    for (const row of db
      .prepare("SELECT * FROM writeback_question_states WHERE status='writing'")
      .all())
      p.writebacks.updateQuestion(
        String(row.job_id),
        String(row.question_id),
        Number(row.retry_cycle),
        { ...state(row), status: 'pending', safeErrorCode: 'WRITE_PENDING', nextAttemptAt: now() },
      );
  });
  wake();
  return {
    wake,
    tick,
    get busy() {
      return Boolean(running);
    },
    get halted() {
      return halted;
    },
    wakeOwner(owner: string) {
      if (closed || halted) return;
      try {
        p.connection.transaction(() => {
          for (const row of db
            .prepare(
              "SELECT q.* FROM writeback_question_states q JOIN writeback_jobs j ON j.id=q.job_id WHERE j.owner_account_id=? AND q.status='pending' AND q.safe_error_code='GOOGLE_AUTH_REQUIRED'",
            )
            .all(owner))
            p.writebacks.updateQuestion(
              String(row.job_id),
              String(row.question_id),
              Number(row.retry_cycle),
              { ...state(row), nextAttemptAt: now() },
            );
        });
        wake();
      } catch {
        halted = true;
        log({ event: 'request_failed', code: 'STORAGE_UNAVAILABLE' });
      }
    },
    async drain() {
      await tick();
      if (halted) throw new AppError('STORAGE_UNAVAILABLE');
    },
    async verify(jobId: string) {
      if (running) throw new AppError('WRITE_PENDING');
      if (halted) throw new AppError('STORAGE_UNAVAILABLE');
      running = (async () => {
        for (const row of p.writebacks.questions(jobId))
          if (row.status !== 'verified' && row.status !== 'conflict') {
            save(row, { status: 'pending', verificationFailureCount: 0, nextAttemptAt: null });
            await processQuestion(current(row), true);
            const fresh = current(row);
            if (fresh.status === 'pending' && fresh.next_attempt_at !== null)
              save(fresh, { nextAttemptAt: null });
          }
      })()
        .catch((error) => {
          if (['STORAGE_UNAVAILABLE', 'STORAGE_CORRUPT'].includes(googleError(error).code))
            halted = true;
          throw error;
        })
        .finally(() => {
          running = undefined;
          arm();
        });
      await running;
    },
    async stop() {
      closed = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
export type WritebackWorker = ReturnType<typeof createWritebackWorker>;
