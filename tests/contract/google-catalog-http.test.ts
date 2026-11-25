import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { catalogServer } from '../helpers/catalog-server.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

it('authorizes, previews only the first worksheet and creates a complete waiting activity atomically', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client('owner-a');
  const list = await client.get('/api/google/spreadsheets');
  expect(list.status).toBe(200);
  expect((await list.json()).data.items[0]).toMatchObject({ id: 'source-one', canEdit: true });
  const previewResponse = await client.post('/api/source-previews', {
    spreadsheetId: 'source-one',
  });
  const preview = (await previewResponse.json()).data;
  expect(preview.source.sheetId).toBe(17);
  expect(preview.questions).toHaveLength(2);
  expect((await client.post('/api/activities', { groupCount: 2 })).status).toBe(400);
  const body = { requestId: randomUUID(), previewId: preview.previewId, groupCount: 2 };
  const created = await client.post('/api/activities', body);
  expect(created.status).toBe(200);
  const activity = (await created.json()).data;
  expect(activity).toMatchObject({ phase: 'waiting', groupCount: 2 });
  expect((await (await client.post('/api/activities', body)).json()).data.activityId).toBe(
    activity.activityId,
  );
  expect(
    (
      await client.post(`/api/activities/${activity.activityId}/source`, {
        spreadsheetUrlOrId: 'source-one',
      })
    ).status,
  ).toBe(404);
  expect(
    server.persistence.activities.getOwned(activity.activityId, 'test-owner-a').source.sheet
      .sheetId,
  ).toBe(17);
});

it('denies other accounts, unauthenticated requests and teacher endpoints on student listener', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const a = await server.client('owner-a');
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
  const b = await server.client('owner-b');
  expect((await b.get(`/api/activities/${activity.activityId}`)).status).toBe(404);
  expect((await (await b.get('/api/session')).json()).data.currentActivityId).toBeNull();
  expect((await fetch(server.url + '/api/google/spreadsheets')).status).toBe(401);
  expect((await fetch(server.studentUrl + '/api/google/spreadsheets')).status).toBe(404);
  expect((await a.post('/api/google/disconnect', {})).status).toBe(200);
  expect((await a.get(`/api/activities/${activity.activityId}`)).status).toBe(401);
});

it('rejects invalid, read-only and changed previews without saving partial activities', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client('owner-a');
  expect(
    (await client.post('/api/source-previews', { spreadsheetId: 'https://evil.invalid' })).status,
  ).toBe(400);
  server.gateway.getFileCapability = async () => ({
    id: 'source-one',
    name: '唯讀教材',
    canEdit: false,
  });
  expect((await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).status).toBe(
    403,
  );
  expect(server.persistence.activities.current()).toBeNull();
});
