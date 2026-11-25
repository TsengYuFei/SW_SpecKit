import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { catalogServer } from '../helpers/catalog-server.js';
import { publishActivity } from '../../backend/src/sockets/activity-handlers.js';

it('isolates teacher subscriptions and disconnects the old account before any further progress', async () => {
  const server = await catalogServer();
  const sockets: ReturnType<typeof io>[] = [];
  try {
    const a = await server.client();
    const b = await server.client('owner-b');
    const preview = (
      await (await a.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
    ).data;
    const activity = (
      await (
        await a.post('/api/activities', {
          requestId: randomUUID(),
          previewId: preview.previewId,
          groupCount: 2,
        })
      ).json()
    ).data;
    server.store.activity!.revision = 7;
    const bootstrap = await (await b.get('/api/session')).json();
    expect(bootstrap).toMatchObject({ revision: 0, data: { currentActivityId: null } });
    expect(await (await b.get('/api/activities/' + activity.activityId)).json()).toMatchObject({
      revision: 0,
      error: { code: 'ACTIVITY_UNAVAILABLE' },
    });
    async function connect(cookie: string) {
      const socket = io(server.url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Cookie: cookie, Origin: server.url },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    }
    const sa = await connect(a.cookie),
      sb = await connect(b.cookie);
    expect(
      await sa.timeout(2000).emitWithAck('activity:subscribe', {
        activityId: activity.activityId,
        requestId: randomUUID(),
      }),
    ).toMatchObject({ ok: true });
    expect(
      await sb.timeout(2000).emitWithAck('activity:subscribe', {
        activityId: activity.activityId,
        requestId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: { code: 'ACTIVITY_UNAVAILABLE' }, revision: 0 });
    const progress: unknown[] = [];
    sa.on('teacher:progress', (data) => progress.push(data));
    const invalidated = new Promise<void>((resolve) =>
      sa.once('teacher:authorization-changed', () => resolve()),
    );
    await a.connect('owner-b');
    await invalidated;
    publishActivity(server.store);
    expect(sa.connected).toBe(false);
    expect(progress).toEqual([]);
    expect((await a.get('/api/activities/' + activity.activityId)).status).toBe(404);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await server.stop();
  }
});
