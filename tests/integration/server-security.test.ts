import { afterEach, expect, it } from 'vitest';
import { request } from 'node:http';
import { createListener } from '../../backend/src/server.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { readConfig } from '../../backend/src/config.js';
import { close, listen } from '../helpers/server.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0)) await stop();
});

async function start() {
  const listener = createListener('teacher', createStore(10), createSessions(), readConfig({}), {
    registerRoutes(app) {
      app.post('/api/test', (_req, res) => res.json({ ok: true }));
    },
  });
  cleanup.push(async () => {
    listener.io.disconnectSockets(true);
    await close(listener.server);
  });
  return listen(listener.server);
}

it('rejects foreign Host and Origin', async () => {
  const url = await start();
  const forgedHostStatus = await new Promise<number>((resolve, reject) => {
    const req = request(`${url}/api/session`, { headers: { host: 'evil.invalid' } }, (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on('error', reject);
    req.end();
  });
  expect(forgedHostStatus).toBe(403);
  expect(
    (await fetch(`${url}/api/session`, { headers: { origin: 'http://evil.invalid' } })).status,
  ).toBe(403);
});

it('requires a valid session and CSRF, then permits valid requests', async () => {
  const url = await start();
  expect((await fetch(`${url}/api/test`, { method: 'POST' })).status).toBe(401);
  const session = await fetch(`${url}/api/session`);
  const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
  const data = (await session.json()).data;
  expect((await fetch(`${url}/api/test`, { method: 'POST', headers: { cookie } })).status).toBe(
    403,
  );
  const response = await fetch(`${url}/api/test`, {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': data.csrfToken },
  });
  expect(response.status).toBe(200);
});

it('rejects oversized bodies and does not leak parser input', async () => {
  const url = await start();
  const response = await fetch(`${url}/api/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'sensitive'.repeat(150000) }),
  });
  const text = await response.text();
  expect(response.status).toBe(400);
  expect(text).not.toContain('sensitive');
});
