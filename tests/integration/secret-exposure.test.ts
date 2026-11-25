import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { createListener } from '../../backend/src/server.js';
import { createSourceModule } from '../../backend/src/source-module.js';
import { createLogger } from '../../backend/src/security/logger.js';
import { safeError } from '../../backend/src/security/safe-errors.js';
import { googleError } from '../../backend/src/google/sheets-client.js';
import { readConfig } from '../../backend/src/config.js';
import { classroom } from '../helpers/activity.js';
import { close, listen } from '../helpers/server.js';

it('excludes synthetic credentials from HTTP, socket errors, snapshots, upstream errors and logs', async () => {
  const marker = 'invalid-demo-private-canary';
  const c = classroom();
  const source = createSourceModule(readConfig({}), c.store, {
    authorizationUrl: (state) => `https://example.invalid/?state=${state}`,
    exchange: async () => ({ access_token: marker, refresh_token: marker }),
    read: async () => {
      throw Object.assign(new Error(marker), {
        response: { status: 503, data: { access_token: marker } },
      });
    },
    write: async () => {
      throw new Error(marker);
    },
  });
  const state = new URL(source.oauth.begin(c.teacher.sessionId)).searchParams.get('state')!;
  await source.oauth.finish(c.teacher.sessionId, state, 'invalid-demo-code');
  const teacher = createListener('teacher', c.store, c.sessions, readConfig({}), {
    registerRoutes: source.registerRoutes,
  });
  const student = createListener('student', c.store, c.sessions, readConfig({}));
  const teacherUrl = await listen(teacher.server);
  const studentUrl = await listen(student.server);
  const socket = io(studentUrl, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: studentUrl, Cookie: c.sessions.cookie(c.a) },
  });
  try {
    const status = await fetch(`${teacherUrl}/api/google/status`, {
      headers: { Cookie: c.sessions.cookie(c.teacher) },
    });
    expect(await status.text()).not.toContain(marker);
    const failure = await fetch(`${teacherUrl}/api/activities/${c.activity.id}/source`, {
      method: 'POST',
      headers: {
        Cookie: c.sessions.cookie(c.teacher),
        Origin: teacherUrl,
        'X-CSRF-Token': c.teacher.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ spreadsheetUrlOrId: 'demo_sheet' }),
    });
    expect(failure.ok).toBe(false);
    expect(await failure.text()).not.toContain(marker);
    if (!socket.connected)
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
    const snapshot = await socket
      .timeout(2000)
      .emitWithAck('activity:subscribe', { activityId: c.activity.id, requestId: randomUUID() });
    expect(JSON.stringify(snapshot)).not.toContain(marker);
    const denied = await socket.timeout(2000).emitWithAck('group:join', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      groupId: c.groups[0]!.id,
      token: marker,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(JSON.stringify(denied)).not.toContain(marker);
    const lines: string[] = [];
    const log = createLogger((line) => lines.push(line));
    log({
      event: 'request_failed',
      code: 'GOOGLE_ERROR',
      authorization: marker,
      cookie: marker,
      body: marker,
      query: marker,
      message: marker,
    });
    expect(lines.join('')).not.toContain(marker);
    expect(
      JSON.stringify(safeError(googleError(Object.assign(new Error(marker), { code: 503 })))),
    ).not.toContain(marker);
  } finally {
    socket.disconnect();
    teacher.io.disconnectSockets(true);
    student.io.disconnectSockets(true);
    await close(teacher.server);
    await close(student.server);
  }
});
