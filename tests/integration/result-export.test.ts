import { expect, it } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
import { catalogServer } from '../helpers/catalog-server.js';
import { createPersistenceFixture } from '../helpers/persistence.js';

function databaseRows(c: Awaited<ReturnType<typeof resultExportFixture>>) {
  const db = c.server.persistence.connection.database;
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => ({
      table: row.name,
      rows: db
        .prepare('SELECT * FROM "' + String(row.name).replaceAll('"', '""') + '" ORDER BY rowid')
        .all(),
    }));
}
it.each(['verified', 'pending', 'conflict', 'failed'] as const)(
  'downloads %s local results without any table or Google change',
  async (jobStatus) => {
    const c = await resultExportFixture({ historyCount: 2, active: true, jobStatus });
    try {
      await c.setGoogleOffline(true);
      const before = databaseRows(c);
      for (const id of c.histories) {
        const response = await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
          headers: c.client.headers,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
        expect(Buffer.from(await response.arrayBuffer()).subarray(0, 3)).toEqual(
          Buffer.from([239, 187, 191]),
        );
      }
      expect(databaseRows(c)).toEqual(before);
      expect(c.googleCalls).toEqual({ read: 0, write: 0 });
    } finally {
      await c.close();
    }
  },
);

it('reopens the same temporary database and downloads the original owned historical activity', async () => {
  const c = await resultExportFixture();
  let restarted: Awaited<ReturnType<typeof catalogServer>> | undefined;
  try {
    const id = c.histories[0]!,
      before = c.snapshot(id).submissions;
    await c.server.stop(true);
    restarted = await catalogServer(
      'teacher',
      createPersistenceFixture(c.server.persistence.directory),
    );
    const client = await restarted.client();
    const response = await fetch(restarted.url + `/api/activities/${id}/export.csv`, {
      headers: client.headers,
    });
    expect(response.status).toBe(200);
    expect(
      (await (await client.get('/api/activities/' + id)).json()).data.snapshot.submissions,
    ).toEqual(before);
  } finally {
    if (restarted) await restarted.stop();
    await c.close();
  }
});
