import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createListener } from '../../backend/src/server.js';
import { writebackRoutes } from '../../backend/src/http/writeback-routes.js';
import { readConfig } from '../../backend/src/config.js';
import { writebackFixture } from '../helpers/writeback.js';
import { close, listen } from '../helpers/server.js';

it('protects writeback routes and returns a stable operation with safe status and verify', async () => {
  const c = writebackFixture();
  const server = createListener('teacher', c.store, c.sessions, readConfig({}), {
    registerRoutes: (app, ctx) => writebackRoutes(app, ctx, c.service),
  });
  const url = await listen(server.server);
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
    server.io.disconnectSockets(true);
    await close(server.server);
  }
});
