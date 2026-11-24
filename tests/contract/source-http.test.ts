import { afterEach, expect, it } from 'vitest';
import { sourceServer } from '../helpers/source-server.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

it('authorizes, loads source and confirms mapping through normal HTTP entry points', async () => {
  const server = await sourceServer();
  stops.push(server.stop);
  const session = await fetch(`${server.url}/api/session`);
  const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
  const { csrfToken } = (await session.json()).data;
  const headers = { cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' };
  const post = (path: string, body: unknown) =>
    fetch(`${server.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const start = await post('/api/google/start', {});
  const url = (await start.json()).data.url;
  const state = new URL(url, server.url).searchParams.get('state')!;
  const callback = await fetch(`${server.url}/api/google/callback?state=${state}&code=demo`, {
    headers,
    redirect: 'manual',
  });
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe('/');
  const replay = await fetch(`${server.url}/api/google/callback?state=${state}&code=demo`, {
    headers,
    redirect: 'manual',
  });
  expect(replay.headers.get('location')).toBe('/');
  const created = await post('/api/activities', { groupCount: 2 });
  const id = (await created.json()).data.activityId;
  const read = await post(`/api/activities/${id}/source`, { spreadsheetUrlOrId: 'example_sheet' });
  expect(read.status).toBe(200);
  const data = (await read.json()).data;
  expect(data.source.questions).toHaveLength(4);
  expect(JSON.stringify(data)).not.toContain('invalid-demo-token');
  const invalid = await post(`/api/activities/${id}/source/confirm`, {
    mappingVersion: data.source.mappingVersion + 1,
  });
  expect(invalid.status).toBe(409);
  const confirmed = await post(`/api/activities/${id}/source/confirm`, {
    mappingVersion: data.source.mappingVersion,
  });
  expect((await confirmed.json()).data.source.confirmed).toBe(true);
  expect((await post('/api/activities', { groupCount: 0 })).status).toBe(400);
  expect((await post('/api/activities', { groupCount: 2, role: 'teacher' })).status).toBe(400);
  expect(
    (
      await post(`/api/activities/${id}/source/confirm`, {
        mappingVersion: data.source.mappingVersion,
        extra: true,
      })
    ).status,
  ).toBe(400);
  expect(
    (await post(`/api/activities/${id}/source`, { spreadsheetUrlOrId: 'https://evil.invalid' }))
      .status,
  ).toBe(400);
});

it('does not expose teacher routes on the student listener', async () => {
  const server = await sourceServer('student');
  stops.push(server.stop);
  expect((await fetch(`${server.url}/api/google/status`)).status).toBe(404);
  expect((await fetch(`${server.url}/api/activities/example`)).status).toBe(404);
});
