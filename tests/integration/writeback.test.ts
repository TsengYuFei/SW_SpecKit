import { expect, it } from 'vitest';
import { workerFixture } from '../helpers/worker.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
import { deferred } from '../helpers/google-adapter.js';
it('automatically writes a complete group as one exact string batch and preserves other cells', async () => {
  const c = workerFixture(),
    original = structuredClone(c.grid);
  try {
    await c.worker.tick();
    expect(c.row().status).toBe('verified');
    expect(c.writes).toHaveLength(1);
    expect(c.writes[0]).toHaveLength(2);
    expect(c.grid.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
    expect(c.grid.rows[1]![3]).toEqual(original.rows[1]![3]);
    expect(c.grid.rows[4]).toEqual(original.rows[4]);
    expect(c.grid.merges).toEqual(original.merges);
  } finally {
    await c.close();
  }
});
it('skips the complete question on target, prompt or merge changes', async () => {
  for (const mutation of ['value', 'prompt', 'merge']) {
    const c = workerFixture();
    try {
      if (mutation === 'value')
        c.grid.rows[1]![4] = { userEnteredValue: { stringValue: 'external edit' } };
      if (mutation === 'prompt')
        c.grid.rows[1]![1] = { userEnteredValue: { stringValue: 'new prompt' } };
      if (mutation === 'merge') c.grid.merges = [];
      await c.worker.tick();
      expect(c.row().status).toBe('conflict');
      expect(c.writes).toEqual([]);
    } finally {
      await c.close();
    }
  }
});
it('checks an ambiguous write immediately and never blindly resends already expected content', async () => {
  const c = workerFixture(),
    write = c.gateway.write;
  try {
    c.gateway.write = async (...args) => {
      await write(...args);
      throw new AppError('NETWORK_ERROR');
    };
    await c.worker.tick();
    expect(c.row().status).toBe('verified');
    expect(c.writes).toHaveLength(1);
  } finally {
    await c.close();
  }
});
it('keeps explicit verify read-only and only reschedules safe baseline retries', async () => {
  for (const mixed of [true, false]) {
    const c = workerFixture(),
      write = c.gateway.write;
    try {
      c.gateway.write = async () => {
        throw new AppError('GOOGLE_ERROR');
      };
      await c.worker.tick();
      expect(c.row().status).toBe('pending');
      if (mixed) c.grid.rows[1]![4] = { userEnteredValue: { stringValue: '=SUM(A1)' } };
      c.gateway.write = write;
      await c.worker.verify(c.jobId());
      expect(c.row().status).toBe(mixed ? 'conflict' : 'pending');
      expect(c.writes).toEqual([]);
    } finally {
      await c.close();
    }
  }
});
it('retains unknown readback, waits for authorization and treats definite denial as failed', async () => {
  const c = workerFixture(),
    read = c.gateway.readSheetById!,
    write = c.gateway.write;
  try {
    c.gateway.write = async (...args) => {
      await write(...args);
      c.gateway.readSheetById = async () => {
        throw new AppError('NETWORK_ERROR');
      };
    };
    await c.worker.tick();
    expect(c.row().status).toBe('pending');
    await c.worker.verify(c.jobId());
    expect(c.row().status).toBe('pending');
    c.gateway.readSheetById = read;
    await c.worker.verify(c.jobId());
    expect(c.row().status).toBe('verified');
  } finally {
    await c.close();
  }
  for (const code of ['GOOGLE_AUTH_REQUIRED', 'GOOGLE_FORBIDDEN', 'RATE_LIMITED'] as const) {
    const denied = workerFixture();
    try {
      if (code === 'GOOGLE_AUTH_REQUIRED') denied.authorized = false;
      else
        denied.gateway.write = async () => {
          throw new AppError(code);
        };
      await denied.worker.tick();
      expect(denied.row().status).toBe(code === 'GOOGLE_AUTH_REQUIRED' ? 'pending' : 'failed');
    } finally {
      await denied.close();
    }
  }
});
it('serializes worker processing and never overlaps verify with an ongoing write', async () => {
  const c = workerFixture(),
    gate = deferred<void>(),
    entered = deferred<void>(),
    write = c.gateway.write;
  try {
    c.gateway.write = async (...args) => {
      entered.resolve();
      await gate.promise;
      await write(...args);
    };
    const first = c.worker.tick();
    await entered.promise;
    expect(c.worker.tick()).toBe(first);
    await expect(c.worker.verify(c.jobId())).rejects.toMatchObject({ code: 'WRITE_PENDING' });
    gate.resolve();
    await first;
    expect(c.row().status).toBe('verified');
    expect(c.writes).toHaveLength(1);
  } finally {
    gate.resolve();
    await c.close();
  }
});
