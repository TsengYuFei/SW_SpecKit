import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { catalogClassroom } from '../helpers/activity.js';
it('lists owned persisted history and saves strict account settings with idempotent receipts', async () => {
  const c = await catalogClassroom();
  try {
    const list = await c.client.get('/api/activities?limit=1');
    expect(list.status).toBe(200);
    expect((await list.json()).data.items[0].id).toBe(c.activity.id);
    const body = { requestId: randomUUID(), defaultGroupCount: 4 };
    expect((await c.client.post('/api/settings', body)).status).toBe(200);
    expect((await c.client.post('/api/settings', body)).status).toBe(200);
    expect((await (await c.client.get('/api/settings')).json()).data.defaultGroupCount).toBe(4);
    expect((await c.client.post('/api/settings', { ...body, defaultGroupCount: 3 })).status).toBe(
      409,
    );
    expect(
      (await c.client.post('/api/settings', { requestId: randomUUID(), defaultGroupCount: 0 }))
        .status,
    ).toBe(400);
    expect(
      (
        await c.client.post('/api/settings', {
          requestId: randomUUID(),
          defaultGroupCount: 2,
          owner: 'other',
        })
      ).status,
    ).toBe(400);
    expect((await fetch(c.server.studentUrl + '/api/settings')).status).toBe(404);
  } finally {
    await c.server.stop();
  }
});
