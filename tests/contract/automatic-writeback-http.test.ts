import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { automaticFixture } from '../helpers/automatic-writeback.js';
it('rejects the obsolete initial write entry, protects owner status, and exposes only existing-job recovery', async () => {
  const c = await automaticFixture();
  try {
    c.answer();
    c.end();
    await c.server.worker!.drain();
    const base = '/api/activities/' + c.activity.id + '/writeback';
    expect((await c.client.post(base, { requestId: randomUUID() })).status).toBe(404);
    const status = await c.client.get(base);
    expect(status.ok).toBe(true);
    expect((await status.json()).data.status).toBe('verified');
    const b = await c.server.client('owner-b');
    expect((await b.get(base)).status).toBe(404);
    expect(
      (await c.client.post(base + '/retry', { requestId: randomUUID(), extra: true })).status,
    ).toBe(400);
    expect((await c.client.post(base + '/retry', { requestId: randomUUID() })).status).toBe(409);
  } finally {
    await c.server.stop();
  }
});

it('retries a failed existing job with an owner receipt, never opening a second cycle on replay', async () => {
  const c = await automaticFixture();
  const write = c.server.gateway.write;
  try {
    c.server.gateway.write = async () => {
      throw new (await import('../../backend/src/security/safe-errors.js')).AppError(
        'GOOGLE_FORBIDDEN',
      );
    };
    c.answer();
    c.end();
    await c.server.worker!.drain();
    expect(c.server.persistence.writebacks.getForActivity(c.activity.id)!.status).toBe('failed');
    c.server.gateway.write = write;
    const path = '/api/activities/' + c.activity.id + '/writeback/retry',
      body = { requestId: randomUUID() };
    expect((await c.client.post(path, body)).ok).toBe(true);
    await c.server.worker!.drain();
    expect((await c.client.post(path, body)).ok).toBe(true);
    const job = c.server.persistence.writebacks.getForActivity(c.activity.id)!;
    expect(c.server.persistence.writebacks.questions(String(job.id))[0]).toMatchObject({
      status: 'verified',
      retry_cycle: 1,
      write_attempt_count: 1,
    });
    expect(c.writes).toHaveLength(1);
  } finally {
    await c.server.stop();
  }
});
