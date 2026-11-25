import { afterEach, expect, it } from 'vitest';
import { catalogServer } from '../helpers/catalog-server.js';
import { deferred } from '../helpers/google-adapter.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

it('preserves next-page cursors on empty pages and exposes incomplete search', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client('owner-a');
  const pages: (string | undefined)[] = [];
  server.gateway.listSpreadsheets = async (_credentials, input) => {
    pages.push(input.pageToken);
    return input.pageToken
      ? {
          items: [{ id: 'source-two', name: '同名教材', canEdit: false }],
          nextPageToken: null,
          incompleteSearch: false,
        }
      : { items: [], nextPageToken: 'second-page', incompleteSearch: true };
  };
  const first = (await (await client.get('/api/google/spreadsheets?query=教材')).json()).data;
  expect(first).toMatchObject({ items: [], incompleteSearch: true });
  expect(first.nextCursor).toBeTruthy();
  const second = (
    await (
      await client.get('/api/google/spreadsheets?query=教材&cursor=' + first.nextCursor)
    ).json()
  ).data;
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(pages).toEqual([undefined, 'second-page']);
  expect(
    (await client.get('/api/google/spreadsheets?query=不同&cursor=' + first.nextCursor)).status,
  ).toBe(400);
});

it('discards a late reply and old cursor after the same teacher session changes Google account', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client('owner-a');
  const pending = deferred<{ items: never[]; nextPageToken: null; incompleteSearch: false }>();
  const entered = deferred<void>();
  server.gateway.listSpreadsheets = async () => {
    entered.resolve();
    return pending.promise;
  };
  const old = client.get('/api/google/spreadsheets');
  await entered.promise;
  await client.connect('owner-b');
  pending.resolve({ items: [], nextPageToken: null, incompleteSearch: false });
  expect((await old).status).toBe(401);
  expect((await (await client.get('/api/google/status')).json()).data.account.email).toBe(
    'teacher-b@example.invalid',
  );
});

it('disambiguates same-name spreadsheets and binds cursors to a teacher browser session', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const a = await server.client(),
    other = await server.client();
  server.gateway.listSpreadsheets = async () => ({
    items: [
      { id: 'one', name: '同名教材', canEdit: true, ownerLabel: '帳號A' },
      { id: 'two', name: '同名教材', canEdit: false, ownerLabel: '共用磁碟' },
    ],
    nextPageToken: 'next',
    incompleteSearch: true,
  });
  const page = (await (await a.get('/api/google/spreadsheets')).json()).data;
  expect(page.items.map((item: { id: string }) => item.id)).toEqual(['one', 'two']);
  expect((await other.get('/api/google/spreadsheets?cursor=' + page.nextCursor)).status).toBe(400);
  await a.connect('owner-b');
  expect((await a.get('/api/google/spreadsheets?cursor=' + page.nextCursor)).status).toBe(400);
});
