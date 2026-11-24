import { expect, it } from 'vitest';
import { writebackFixture } from '../helpers/writeback.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
import { deferred } from '../helpers/google-adapter.js';

it('writes one atomic batch for a complete question, verifies strings, and preserves other cells', async () => {
  const c = writebackFixture();
  const original = structuredClone(c.grid);
  const op = c.start();
  expect(c.activity.writebackPending).toBe(true);
  expect(() => c.store.createActivity(2)).toThrow();
  await c.service.wait(op.operationId);
  expect(op.status).toBe('verified');
  expect(c.writes).toHaveLength(1);
  expect(c.writes[0]).toHaveLength(2);
  expect(c.grid[0]!.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
  expect(c.grid[0]!.rows[1]![3]).toEqual(original[0]!.rows[1]![3]);
  expect(c.grid[0]!.merges).toEqual(original[0]!.merges);
  expect(c.activity.writebackPending).toBe(false);
  expect(c.store.createActivity(2).id).not.toBe(c.activity.id);
});

it('skips the whole question when a target or prompt or merge changes', async () => {
  for (const mutation of ['value', 'prompt', 'merge']) {
    const c = writebackFixture();
    if (mutation === 'value')
      c.grid[0]!.rows[1]![4] = { userEnteredValue: { stringValue: 'external edit' } };
    if (mutation === 'prompt')
      c.grid[0]!.rows[1]![1] = { userEnteredValue: { stringValue: 'new prompt' } };
    if (mutation === 'merge') c.grid[0]!.merges = [];
    const op = c.start();
    await c.service.wait(op.operationId);
    expect(op.status).toBe('conflict');
    expect(c.writes).toHaveLength(0);
    expect(c.activity.writebackPending).toBe(false);
  }
});

it('retains pending after an ambiguous write and verifies the content without blindly resending', async () => {
  const c = writebackFixture();
  const write = c.gateway.write;
  c.gateway.write = async (...args) => {
    await write(...args);
    throw new AppError('NETWORK_ERROR');
  };
  const op = c.start();
  await c.service.wait(op.operationId);
  expect(op.status).toBe('pending');
  expect(() => c.store.createActivity(2)).toThrow();
  await c.service.verify(c.activity.id, op.operationId, c.teacher.sessionId);
  expect(op.status).toBe('verified');
  expect(c.writes).toHaveLength(1);
});

it('only retries after reading an unchanged baseline and rejects mixed content', async () => {
  for (const mixed of [true, false]) {
    const c = writebackFixture();
    const write = c.gateway.write;
    c.gateway.write = async () => {
      throw new AppError('GOOGLE_ERROR');
    };
    const op = c.start();
    await c.service.wait(op.operationId);
    expect(op.status).toBe('pending');
    if (mixed) c.grid[0]!.rows[1]![4] = { userEnteredValue: { stringValue: '=SUM(A1)' } };
    c.gateway.write = write;
    await c.service.verify(c.activity.id, op.operationId, c.teacher.sessionId);
    expect(op.status).toBe(mixed ? 'conflict' : 'verified');
    expect(c.writes).toHaveLength(mixed ? 0 : 1);
  }
});

it('keeps pending on failed readback or verify, and treats definite write denial as failed', async () => {
  const c = writebackFixture();
  const read = c.gateway.read;
  const write = c.gateway.write;
  c.gateway.write = async (...args) => {
    await write(...args);
    c.gateway.read = async () => {
      throw new AppError('NETWORK_ERROR');
    };
  };
  const op = c.start();
  await c.service.wait(op.operationId);
  expect(op.status).toBe('pending');
  await c.service.verify(c.activity.id, op.operationId, c.teacher.sessionId);
  expect(op.status).toBe('pending');
  c.gateway.read = read;
  await c.service.verify(c.activity.id, op.operationId, c.teacher.sessionId);
  expect(op.status).toBe('verified');
  for (const code of ['GOOGLE_AUTH_REQUIRED', 'GOOGLE_FORBIDDEN', 'RATE_LIMITED'] as const) {
    const denied = writebackFixture();
    denied.gateway.write = async () => {
      throw new AppError(code);
    };
    const failed = denied.start();
    await denied.service.wait(failed.operationId);
    expect(failed.status).toBe('failed');
    expect(denied.activity.writebackPending).toBe(false);
  }
});

it('serializes operations, deduplicates request IDs and never overlaps verify with writing', async () => {
  const c = writebackFixture();
  const gate = deferred<void>();
  const write = c.gateway.write;
  c.gateway.write = async (...args) => {
    await gate.promise;
    await write(...args);
  };
  const id = crypto.randomUUID();
  const first = c.service.start(c.activity.id, c.teacher.sessionId, id);
  expect(c.service.start(c.activity.id, c.teacher.sessionId, id)).toBe(first);
  expect(c.start).toThrow();
  await expect(
    c.service.verify(c.activity.id, first.operationId, c.teacher.sessionId),
  ).rejects.toThrow();
  gate.resolve();
  await c.service.wait(first.operationId);
  expect(first.status).toBe('verified');
  expect(c.writes).toHaveLength(1);
});
