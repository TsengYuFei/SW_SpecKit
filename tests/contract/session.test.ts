import { afterEach, expect, it } from 'vitest';
import { createListener } from '../../backend/src/server.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { readConfig } from '../../backend/src/config.js';
import { close, listen } from '../helpers/server.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0)) await stop();
});

async function start(role: 'teacher' | 'student') {
  const store = createStore(10);
  const listener = createListener(role, store, createSessions(), readConfig({}));
  cleanup.push(async () => {
    listener.io.disconnectSockets(true);
    await close(listener.server);
  });
  return { store, url: await listen(listener.server) };
}

it('initializes the correct teacher session with CSRF and current activity', async () => {
  const { store, url } = await start('teacher');
  const activity = store.createActivity(2);
  const response = await fetch(`${url}/api/session`);
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toMatch(/teacher_session=.+HttpOnly; SameSite=Lax/);
  const json = await response.json();
  expect(json).toMatchObject({
    ok: true,
    revision: 0,
    data: { role: 'teacher', bootId: store.bootId, currentActivityId: activity.id },
  });
  expect(json.data.csrfToken).toHaveLength(64);
  expect(json.data.sessionId).toBeUndefined();
});

it('does not expose the current activity in a student session', async () => {
  const { store, url } = await start('student');
  store.createActivity(2);
  const response = await fetch(`${url}/api/session`);
  expect(response.headers.get('set-cookie')).toContain('SameSite=Strict');
  const json = await response.json();
  expect(json.data.role).toBe('student');
  expect(json.data.currentActivityId).toBeUndefined();
  expect(json.data.sessionId).toBeUndefined();
  const health = await fetch(`${url}/api/health`).then((r) => r.json());
  expect(health.data.bootId).toBe(store.bootId);
});
