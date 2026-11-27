import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { expect, it, vi } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
import { ExportGateError } from '../../backend/src/export/export-gate.js';
import { deferred } from '../helpers/google-adapter.js';
it('enforces owner, CSRF, phase, UUID, empty input and HEAD without ever attaching an error CSV', async () => {
  const c = await resultExportFixture({ active: true });
  try {
    const base = c.server.url + `/api/activities/${c.histories[0]!}/export.csv`;
    for (const [url, headers, expected] of [
      [base, {}, 401],
      [base, { cookie: c.client.cookie }, 403],
      [base + '?owner=forged', c.client.headers, 400],
      [c.server.url + `/api/activities/${c.activeActivity}/export.csv`, c.client.headers, 409],
      [c.server.url + `/api/activities/${randomUUID()}/export.csv`, c.client.headers, 404],
      [c.server.url + '/api/activities/invalid/export.csv', c.client.headers, 400],
      [base, { ...c.client.headers, origin: 'https://invalid.example' }, 403],
    ] as const) {
      const response = await fetch(url, { headers });
      expect(response.status).toBe(expected);
      expect(response.headers.get('content-disposition')).toBeNull();
      expect((await response.json()).ok).toBe(false);
    }
    const head = await fetch(base, { method: 'HEAD' });
    expect(head.status).toBe(405);
    expect(head.headers.get('allow')).toBe('GET');
    const bodyResponse = await new Promise<{ status: number; attachment: string | undefined }>(
      (resolve, reject) => {
        const req = request(
          base,
          { method: 'GET', headers: { ...c.client.headers, 'content-length': 2 } },
          (res) => {
            res.resume();
            res.once('end', () =>
              resolve({ status: res.statusCode!, attachment: res.headers['content-disposition'] }),
            );
          },
        );
        req.on('error', reject);
        req.end('{}');
      },
    );
    expect(bodyResponse).toEqual({ status: 400, attachment: undefined });
    const b = await c.server.client('owner-b');
    expect((await fetch(base, { headers: b.headers })).status).toBe(404);
    expect(
      (await fetch(c.server.studentUrl + `/api/activities/${c.histories[0]}/export.csv`)).status,
    ).toBe(404);
    expect((await fetch(base, { headers: c.client.headers })).status).toBe(200);
    const conditional = await fetch(base, {
      headers: {
        ...c.client.headers,
        'if-none-match': '*',
        'if-modified-since': 'Wed, 01 Jan 2020 00:00:00 GMT',
      },
    });
    expect(conditional.status).toBe(200);
    expect(conditional.headers.get('etag')).toBeNull();
    expect(conditional.headers.get('last-modified')).toBeNull();
    const limited = await fetch(base, { headers: c.client.headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  } finally {
    await c.close();
  }
});

it('returns 422/503 safely and rechecks authorization after generating bytes', async () => {
  const c = await resultExportFixture();
  const restore = c.server.resultExport!.download;
  const entered = deferred<void>(),
    release = deferred<void>();
  try {
    const id = c.histories[0]!,
      url = c.server.url + `/api/activities/${id}/export.csv`;
    const db = c.server.persistence.connection.database;
    const source = String(
      db.prepare('SELECT source_snapshot_json FROM activities WHERE id=?').get(id)!
        .source_snapshot_json,
    );
    c.server.persistence.connection.transaction(() =>
      db
        .prepare('UPDATE activities SET source_snapshot_json=? WHERE id=?')
        .run(JSON.stringify({ oversized: 'x'.repeat(32 * 1024 * 1024) }), id),
    );
    const large = await fetch(url, { headers: c.client.headers });
    expect(large.status).toBe(422);
    expect(large.headers.get('content-disposition')).toBeNull();
    c.server.persistence.connection.transaction(() =>
      db.prepare('UPDATE activities SET source_snapshot_json=? WHERE id=?').run(source, id),
    );
    const spy = vi
      .spyOn(c.server.resultExport!, 'download')
      .mockRejectedValueOnce(new ExportGateError('EXPORT_BUSY', 1));
    const busy = await fetch(url, { headers: c.client.headers });
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('1');
    expect(busy.headers.get('content-disposition')).toBeNull();
    spy.mockImplementation(async (...args) => {
      const bytes = await restore(...args);
      entered.resolve();
      await release.promise;
      return bytes;
    });
    const pending = fetch(url, { headers: c.client.headers });
    await entered.promise;
    await c.client.connect('owner-b');
    release.resolve();
    const stale = await pending;
    expect(stale.status).toBe(401);
    expect(stale.headers.get('content-disposition')).toBeNull();
    spy.mockRestore();
    const session = c.server.sessions.find(c.client.cookie, 'teacher')!;
    c.server.oauth.disconnect(session.sessionId);
    expect((await fetch(url, { headers: c.client.headers })).status).toBe(401);
  } finally {
    release.resolve();
    vi.restoreAllMocks();
    await c.close();
  }
});
