import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { catalogWritebackFixture } from '../helpers/writeback.js';
it('protects automatic writeback status and recovery while rejecting obsolete manual writes', async () => {
  const c = await catalogWritebackFixture();
  try {
    const path = '/api/activities/' + c.activity.id + '/writeback';
    expect((await c.client.get(path)).status).toBe(409);
    c.end();
    await c.server.worker!.drain();
    expect(
      (await c.client.post(path + '/retry', { requestId: randomUUID(), extra: true })).status,
    ).toBe(400);
    expect((await c.client.post(path, { requestId: randomUUID() })).status).toBe(404);
    const first = (await (await c.client.get(path)).json()).data;
    expect(first.status).toBe('verified');
    expect((await (await c.client.get(path)).json()).data.operationId).toBe(first.operationId);
    expect((await c.client.post(path + '/retry', { requestId: randomUUID() })).status).toBe(409);
    expect(
      (await fetch(c.server.url + path, { headers: { Cookie: c.sessions.cookie(c.a) } })).status,
    ).toBe(401);
  } finally {
    await c.server.stop();
  }
});
