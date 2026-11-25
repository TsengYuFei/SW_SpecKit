import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { createLogger } from '../../backend/src/security/logger.js';
import { safeError } from '../../backend/src/security/safe-errors.js';
import { googleError } from '../../backend/src/google/sheets-client.js';
import { catalogServer } from '../helpers/catalog-server.js';

it('excludes synthetic credentials from catalog HTTP, socket errors, snapshots, upstream errors, database and logs', async () => {
  const marker = 'invalid-demo-private-canary';
  const server = await catalogServer();
  let socket: ReturnType<typeof io> | undefined;
  try {
    server.gateway.exchange = async (code) => ({
      access_token: marker,
      refresh_token: marker,
      id_token: code,
    });
    const client = await server.client();
    expect(await (await client.get('/api/google/status')).text()).not.toContain(marker);
    const preview = (
      await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
    ).data;
    const created = (
      await (
        await client.post('/api/activities', {
          requestId: randomUUID(),
          previewId: preview.previewId,
          groupCount: 2,
        })
      ).json()
    ).data;
    server.gateway.readFirstSheet = async () => {
      throw googleError(
        Object.assign(new Error(marker), {
          response: { status: 503, data: { access_token: marker } },
        }),
      );
    };
    const failure = await client.post('/api/source-previews', { spreadsheetId: 'source-one' });
    expect(failure.ok).toBe(false);
    expect(await failure.text()).not.toContain(marker);
    const session = await fetch(server.studentUrl + '/api/session');
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
    socket = io(server.studentUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: server.studentUrl, Cookie: cookie },
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', resolve);
      socket!.once('connect_error', reject);
    });
    const snapshot = await socket.timeout(2000).emitWithAck('activity:subscribe', {
      activityId: created.activityId,
      requestId: randomUUID(),
    });
    expect(JSON.stringify(snapshot)).not.toContain(marker);
    const denied = await socket.timeout(2000).emitWithAck('group:join', {
      activityId: created.activityId,
      requestId: randomUUID(),
      groupId: [...server.store.activity!.groups.keys()][0],
      token: marker,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(JSON.stringify(denied)).not.toContain(marker);
    for (const table of [
      'teacher_accounts',
      'account_command_receipts',
      'activities',
      'participants',
    ]) {
      expect(
        JSON.stringify(
          server.persistence.connection.database.prepare('SELECT * FROM ' + table).all(),
        ),
      ).not.toContain(marker);
    }
    const lines: string[] = [];
    createLogger((line) => lines.push(line))({
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
    socket?.disconnect();
    await server.stop();
  }
});
