import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backup } from 'node:sqlite';
import { google } from 'googleapis';
import { io } from 'socket.io-client';
import { expect, it, vi } from 'vitest';
import { catalogServer } from '../helpers/catalog-server.js';
import { createLogger } from '../../backend/src/security/logger.js';
import { safeError } from '../../backend/src/security/safe-errors.js';
import { createGoogleGateway, googleError } from '../../backend/src/google/sheets-client.js';
import { readConfig } from '../../backend/src/config.js';

it('keeps synthetic OAuth and browser secrets out of WAL, SHM, backups, public data, errors, logs and a safe report', async () => {
  const marker = 'invalid-phase8-' + randomUUID();
  const server = await catalogServer();
  const publicData: unknown[] = [];
  const logs: string[] = [];
  let socket: ReturnType<typeof io> | undefined;
  const secrets = [marker];
  // Boolean assertions keep a failing test/report from dumping credentials or database bytes.
  const secretFree = (content: string | Buffer) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    expect(
      secrets.every(
        (secret) =>
          !bytes.includes(Buffer.from(secret)) && !bytes.includes(Buffer.from(secret, 'utf16le')),
      ),
    ).toBe(true);
  };
  const info = vi.spyOn(console, 'info').mockImplementation((line) => logs.push(String(line)));
  try {
    server.gateway.exchange = async () => ({
      access_token: marker,
      refresh_token: marker,
      id_token: marker,
    });
    const client = await server.client();
    secrets.push(client.cookie.split('=')[1]!, client.csrfToken);
    const preview = (
      await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
    ).data;
    const created = await (
      await client.post('/api/activities', {
        requestId: randomUUID(),
        previewId: preview.previewId,
        groupCount: 2,
      })
    ).json();
    publicData.push(created, await (await client.get('/api/google/status')).json());
    const session = await fetch(server.studentUrl + '/api/session');
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
    secrets.push(cookie.split('=')[1]!);
    socket = io(server.studentUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: server.studentUrl, Cookie: cookie },
    });
    await new Promise<void>((done, reject) => {
      socket!.once('connect', done);
      socket!.once('connect_error', () => reject(new Error('TEST_SOCKET_CONNECT_FAILED')));
    });
    const send = (event: string, extra = {}) =>
      socket!.timeout(2000).emitWithAck(event, {
        activityId: created.data.activityId,
        requestId: randomUUID(),
        ...extra,
      });
    const subscribed = await send('activity:subscribe');
    expect(subscribed.ok).toBe(true);
    const joined = await send('group:join', {
      groupId: [...server.store.activity!.groups.keys()][0],
      name: '合成安全組',
    });
    expect(joined.ok).toBe(true);
    publicData.push(subscribed, joined, await send('group:join', { token: marker }));
    publicData.push(await (await client.get('/api/activities')).json());
    server.gateway.readFirstSheet = async () => {
      throw googleError(
        Object.assign(new Error(marker), { response: { status: 503, data: marker } }),
      );
    };
    const failed = await client.post('/api/source-previews', { spreadsheetId: 'source-one' });
    expect(failed.ok).toBe(false);
    publicData.push(await failed.json());

    // Exercise the real SDK adapter's verifyIdToken catch and OAuth exchange catch without a network call.
    const gateway = createGoogleGateway(
      readConfig({
        GOOGLE_CLIENT_ID: 'invalid-demo-client',
        GOOGLE_CLIENT_SECRET: marker,
      }),
    );
    vi.spyOn(google.auth.OAuth2.prototype, 'verifyIdToken').mockRejectedValue(new Error(marker));
    vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockRejectedValue(new Error(marker));
    server.gateway.verifiedIdentity = gateway.verifiedIdentity;
    expect((await client.connect('owner-a')).status).toBe(302);
    const status = await (await client.get('/api/google/status')).json();
    expect(status.data.authorized).toBe(false);
    publicData.push(status);
    try {
      await gateway.exchange(marker);
      throw new Error('TEST_EXPECTED_EXCHANGE_FAILURE');
    } catch (error) {
      const safe = safeError(error);
      expect(safe.code).toBe('GOOGLE_ERROR');
      publicData.push(safe);
    }
    createLogger((line) => logs.push(line))({
      event: 'request_failed',
      code: 'GOOGLE_ERROR',
      authorization: marker,
      cookie,
      credentials: marker,
      message: marker,
      body: marker,
      query: marker,
    });
    const db = server.persistence.connection.database;
    expect(db.prepare('SELECT count(*) AS n FROM participants').get()).toEqual({ n: 1 });
    expect(
      db.prepare('SELECT browser_token_digest FROM participants').get()?.browser_token_digest ===
        createHash('sha256').update(cookie.split('=')[1]!).digest('hex'),
    ).toBe(true);
    const backupPath = join(server.persistence.directory, 'snapshot.sqlite.bak');
    await backup(db, backupPath);
    const files = readdirSync(server.persistence.directory);
    for (const suffix of [
      'classroom.sqlite',
      'classroom.sqlite-wal',
      'classroom.sqlite-shm',
      'snapshot.sqlite.bak',
    ])
      expect(files.includes(suffix)).toBe(true);
    for (const file of files) secretFree(readFileSync(join(server.persistence.directory, file)));
    secretFree(JSON.stringify(publicData));
    secretFree(logs.join('\n'));
    const reportPath = join(server.persistence.directory, 'safe-report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({ status: 'passed', scannedFiles: files.length, leaks: 0 }),
    );
    secretFree(readFileSync(reportPath));
  } finally {
    socket?.disconnect();
    await server.stop();
    info.mockRestore();
    vi.restoreAllMocks();
  }
});

it('excludes database main files, sidecars, backups and secret files from Git at arbitrary local paths', () => {
  const paths = [
    'data/activity.sqlite',
    'local.sqlite',
    'local.sqlite-wal',
    'local.sqlite-shm',
    'local.sqlite-journal',
    'local.sqlite.bak',
    'local.sqlite3',
    'local.sqlite3-wal',
    'local.sqlite3-shm',
    'local.sqlite3.bak',
    'local.db',
    'local.db-wal',
    'local.db-shm',
    'local.db.bak',
    'backups/archive.bin',
    '.env.local',
    'credentials-demo.json',
    'secrets/demo.json',
  ];
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], {
    cwd: resolve('.'),
    input: paths.join('\n') + '\n',
    encoding: 'utf8',
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/);
  expect(ignored).toEqual(paths);
});
