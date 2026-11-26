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

it('never acknowledges unsaved HTTP settings and safely retries the same request without changing another owner', async () => {
  const c = await catalogClassroom();
  const db = c.server.persistence.connection.database;
  try {
    const b = await c.server.client('owner-b');
    const body = { requestId: randomUUID(), defaultGroupCount: 7 };
    const prior = (await (await c.client.get('/api/settings')).json()).data;
    db.exec('PRAGMA query_only=ON');
    const failure = await c.client.post('/api/settings', body);
    expect(failure.status).toBe(503);
    expect(await failure.json()).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE' },
    });
    expect((await (await c.client.get('/api/settings')).json()).data).toEqual(prior);
    expect(
      db
        .prepare('SELECT count(*) AS n FROM account_command_receipts WHERE request_id=?')
        .get(body.requestId),
    ).toEqual({ n: 0 });
    db.exec('PRAGMA query_only=OFF');
    expect((await c.client.post('/api/settings', body)).status).toBe(200);
    const saved = db.prepare('SELECT * FROM teacher_settings').all();
    expect((await c.client.post('/api/settings', body)).status).toBe(200);
    expect(db.prepare('SELECT * FROM teacher_settings').all()).toEqual(saved);
    expect(
      db
        .prepare('SELECT count(*) AS n FROM account_command_receipts WHERE request_id=?')
        .get(body.requestId),
    ).toEqual({ n: 1 });
    expect((await (await b.get('/api/settings')).json()).data).toEqual(prior);
    expect(
      (await b.post('/api/settings', { requestId: randomUUID(), defaultGroupCount: 3 })).status,
    ).toBe(200);
    const reopened = await c.server.client();
    expect((await (await reopened.get('/api/settings')).json()).data.defaultGroupCount).toBe(7);
    expect((await (await b.get('/api/settings')).json()).data.defaultGroupCount).toBe(3);
    expect(
      (await c.client.post('/api/settings', { requestId: randomUUID(), defaultGroupCount: 101 }))
        .status,
    ).toBe(400);
  } finally {
    db.exec('PRAGMA query_only=OFF');
    await c.server.stop();
  }
});
