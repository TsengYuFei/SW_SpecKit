import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { catalogServer } from '../helpers/catalog-server.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
import { sampleSheet } from '../fixtures/guided-notes.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const stop of stops.splice(0)) await stop();
});

it('rejects expired previews without creating a partial activity', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
  ).data;
  vi.spyOn(Date, 'now').mockReturnValue(preview.expiresAt + 1);
  const result = await client.post('/api/activities', {
    requestId: randomUUID(),
    previewId: preview.previewId,
    groupCount: 2,
  });
  expect((await result.json()).error.code).toBe('PREVIEW_EXPIRED');
  expect(server.persistence.activities.current()).toBeNull();
});

it('rechecks edit permission and source fingerprint before saving', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
  ).data;
  const body = { requestId: randomUUID(), previewId: preview.previewId, groupCount: 2 };
  server.gateway.getFileCapability = async () => ({
    id: 'source-one',
    name: '教材一',
    canEdit: false,
  });
  expect((await client.post('/api/activities', body)).status).toBe(403);
  server.gateway.getFileCapability = async () => ({
    id: 'source-one',
    name: '教材一',
    canEdit: true,
  });
  server.gateway.readFirstSheet = async () => ({
    spreadsheetTitle: '已更名',
    sheet: sampleSheet(17),
  });
  expect((await (await client.post('/api/activities', body)).json()).error.code).toBe(
    'SOURCE_CONFLICT',
  );
  expect(server.persistence.activities.current()).toBeNull();
});

it('deduplicates concurrent creates and refuses a different create without half a scene', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
  ).data;
  const body = { requestId: randomUUID(), previewId: preview.previewId, groupCount: 2 };
  const outcomes = await Promise.all([
    client.post('/api/activities', body),
    client.post('/api/activities', body),
  ]);
  const data = await Promise.all(outcomes.map(async (r) => (await r.json()).data));
  expect(data[0].activityId).toBe(data[1].activityId);
  const other = await client.post('/api/activities', { ...body, requestId: randomUUID() });
  expect((await other.json()).error.code).toBe('SYSTEM_BUSY');
  expect(
    server.persistence.connection.database.prepare('SELECT count(*) AS n FROM activities').get(),
  ).toMatchObject({ n: 1 });
});

it.each([
  'GOOGLE_AUTH_REQUIRED',
  'GOOGLE_FORBIDDEN',
  'SHEET_NOT_FOUND_OR_INACCESSIBLE',
  'RATE_LIMITED',
  'GOOGLE_ERROR',
  'NETWORK_ERROR',
] as const)('returns a safe %s catalog failure without success data', async (code) => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  server.gateway.listSpreadsheets = async () => {
    throw new AppError(code);
  };
  const result = await client.get('/api/google/spreadsheets');
  expect(result.ok).toBe(false);
  expect(await result.json()).toMatchObject({ ok: false, error: { code } });
});

it('never falls back from a first worksheet with no questions', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  server.gateway.readFirstSheet = async () => {
    const sheet = sampleSheet(17);
    sheet.rows = [];
    sheet.merges = [];
    return { spreadsheetTitle: '首張無題', sheet };
  };
  let legacyReads = 0;
  server.gateway.read = async () => {
    legacyReads++;
    return [sampleSheet(29)];
  };
  expect((await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).ok).toBe(
    false,
  );
  expect(legacyReads).toBe(0);
  expect(server.persistence.activities.current()).toBeNull();
});

it('builds a second editable source with shifted question coordinates', async () => {
  const server = await catalogServer();
  stops.push(server.stop);
  const client = await server.client();
  server.gateway.getFileCapability = async (id) => ({ id, name: '另一份教材', canEdit: true });
  server.gateway.readFirstSheet = async () => ({
    spreadsheetTitle: '另一份教材',
    sheet: sampleSheet(29, 5, 2),
  });
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-two' })).json()
  ).data;
  expect(preview.source.sheetId).toBe(29);
  const result = await client.post('/api/activities', {
    requestId: randomUUID(),
    previewId: preview.previewId,
    groupCount: 3,
  });
  expect(result.ok).toBe(true);
  const saved = server.persistence.activities.current()!;
  expect(saved.source.spreadsheetId).toBe('source-two');
  expect(saved.source.questions[0]!.items[0]!.target).toMatchObject({
    sheetId: 29,
    rowIndex: 6,
    columnIndex: 6,
  });
});
