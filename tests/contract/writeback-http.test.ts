import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { catalogWritebackFixture } from '../helpers/writeback.js';

it('protects writeback routes and returns a stable operation with safe status and verify', async () => {
  const c = await catalogWritebackFixture();
  const url = c.server.url;
  try {
    const headers = {
      Cookie: c.sessions.cookie(c.teacher),
      'X-CSRF-Token': c.teacher.csrfToken,
      'Content-Type': 'application/json',
      Origin: url,
    };
    const path = `${url}/api/activities/${c.activity.id}/writeback`;
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers,
          body: JSON.stringify({ requestId: randomUUID(), extra: true }),
        })
      ).status,
    ).toBe(400);
    const requestId = randomUUID();
    const first = await (
      await fetch(path, { method: 'POST', headers, body: JSON.stringify({ requestId }) })
    ).json();
    const op = first.data.operationId;
    await c.service.wait(op);
    expect(
      (
        await (
          await fetch(path, { method: 'POST', headers, body: JSON.stringify({ requestId }) })
        ).json()
      ).data.operationId,
    ).toBe(op);
    expect((await (await fetch(`${path}/${op}`, { headers })).json()).data.status).toBe('verified');
    expect(
      (await (await fetch(`${path}/${op}/verify`, { method: 'POST', headers, body: '{}' })).json())
        .data.status,
    ).toBe('verified');
    expect(
      (await fetch(`${path}/${op}`, { headers: { ...headers, Cookie: c.sessions.cookie(c.a) } }))
        .status,
    ).toBe(401);
    c.activity.phase = 'active';
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers,
          body: JSON.stringify({ requestId: randomUUID() }),
        })
      ).status,
    ).toBe(409);
  } finally {
    await c.server.stop();
  }
});
