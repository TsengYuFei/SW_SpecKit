import { expect, it } from 'vitest';
import { catalogClassroom } from '../helpers/activity.js';
it('isolates owners and reads saved detail without consulting Google', async () => {
  const c = await catalogClassroom();
  try {
    const b = await c.server.client('owner-b');
    expect((await (await b.get('/api/activities')).json()).data.items).toEqual([]);
    expect((await b.get('/api/activities/' + c.activity.id)).status).toBe(404);
    c.server.gateway.readFirstSheet = async () => {
      throw new Error('saved history must not read Google');
    };
    const detail = await c.client.get('/api/activities/' + c.activity.id);
    expect(detail.status).toBe(200);
    const saved = (await detail.json()).data;
    expect(saved.snapshot.groups).toHaveLength(2);
    expect(saved.source.spreadsheetId).toBe('source-one');
    await c.client.post('/api/google/disconnect', {});
    expect((await c.client.get('/api/activities')).status).toBe(401);
  } finally {
    await c.server.stop();
  }
});

it('paginates tied timestamps stably and refuses cursor reuse across account, browser, limit and expiry', async () => {
  const { randomUUID } = await import('node:crypto');
  const { executeCommand } = await import('../../backend/src/activity/lifecycle-reducer.js');
  const { vi } = await import('vitest');
  const c = await catalogClassroom();
  try {
    const ids = [c.activity.id];
    for (let index = 0; index < 2; index++) {
      executeCommand(c.store, c.teacher, 'activity:start', {
        activityId: ids.at(-1)!,
        requestId: randomUUID(),
      });
      executeCommand(c.store, c.teacher, 'activity:end', {
        activityId: ids.at(-1)!,
        requestId: randomUUID(),
      });
      await c.server.worker!.drain();
      const preview = (
        await (await c.client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
      ).data;
      ids.push(
        (
          await (
            await c.client.post('/api/activities', {
              requestId: randomUUID(),
              previewId: preview.previewId,
              groupCount: 2,
            })
          ).json()
        ).data.activityId,
      );
    }
    c.server.persistence.connection.database
      .prepare('UPDATE activities SET created_at=12345')
      .run();
    const first = (await (await c.client.get('/api/activities?limit=1')).json()).data;
    expect(first.nextCursor).toBeTruthy();
    const second = (
      await (await c.client.get('/api/activities?limit=1&cursor=' + first.nextCursor)).json()
    ).data;
    const third = (
      await (await c.client.get('/api/activities?limit=1&cursor=' + second.nextCursor)).json()
    ).data;
    expect([first.items[0].id, second.items[0].id, third.items[0].id]).toEqual(
      [...ids].sort().reverse(),
    );
    expect(third.nextCursor).toBeNull();
    expect((await c.client.get('/api/activities?limit=2&cursor=' + first.nextCursor)).status).toBe(
      400,
    );
    const another = await c.server.client();
    expect((await another.get('/api/activities?limit=1&cursor=' + first.nextCursor)).status).toBe(
      400,
    );
    const b = await c.server.client('owner-b');
    expect((await b.get('/api/activities?limit=1&cursor=' + first.nextCursor)).status).toBe(400);
    expect((await c.client.get('/api/activities?limit=101')).status).toBe(400);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    expect((await c.client.get('/api/activities?limit=1&cursor=' + first.nextCursor)).status).toBe(
      400,
    );
    vi.restoreAllMocks();
    const current = c.server.store.activity!.id;
    c.server.gateway.readSheetById = async () => {
      throw new Error('Google source deleted');
    };
    expect((await c.client.get('/api/activities/' + ids[0])).status).toBe(200);
    expect(c.server.store.activity!.id).toBe(current);
  } finally {
    vi.restoreAllMocks();
    await c.server.stop();
  }
});
