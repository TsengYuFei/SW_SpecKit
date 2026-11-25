import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { sourceServer } from '../helpers/source-server.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

it('authorizes and confirms first-sheet mapping through catalog HTTP entry points', async () => {
  const server = await sourceServer();
  stops.push(server.stop);
  const client = await server.client();
  const page = (await (await client.get('/api/google/spreadsheets')).json()).data;
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: page.items[0].id })).json()
  ).data;
  expect(preview.questions).toHaveLength(2);
  expect(JSON.stringify(preview)).not.toContain('invalid-demo-token');
  const body = { requestId: randomUUID(), previewId: preview.previewId, groupCount: 2 };
  const created = (await (await client.post('/api/activities', body)).json()).data;
  expect(created.source.confirmed).toBe(true);
  expect((await client.post('/api/activities', { ...body, groupCount: 0 })).status).toBe(400);
  expect((await client.post('/api/activities', { ...body, role: 'teacher' })).status).toBe(400);
  expect(
    (await client.post('/api/source-previews', { spreadsheetId: 'source-one', extra: true }))
      .status,
  ).toBe(400);
  expect(
    (await client.post('/api/source-previews', { spreadsheetId: 'https://evil.invalid' })).status,
  ).toBe(400);
  expect(
    (
      await client.post(`/api/activities/${created.activityId}/source`, {
        spreadsheetUrlOrId: 'source-one',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await client.post(`/api/activities/${created.activityId}/source/confirm`, {
        mappingVersion: 1,
      })
    ).status,
  ).toBe(404);
});

it('does not expose teacher routes on the student listener', async () => {
  const server = await sourceServer('student');
  stops.push(server.stop);
  expect((await fetch(`${server.url}/api/google/status`)).status).toBe(404);
  expect((await fetch(`${server.url}/api/activities/example`)).status).toBe(404);
});
