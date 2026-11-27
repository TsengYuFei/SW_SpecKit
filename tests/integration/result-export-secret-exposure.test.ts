import { expect, it } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
it('exports only business fields, omits synthetic session/identity data and performs no Google or job writes', async () => {
  const c = await resultExportFixture();
  try {
    const db = c.server.persistence.connection.database;
    const before = [
      'writeback_jobs',
      'writeback_attempts',
      'command_receipts',
      'account_command_receipts',
    ].map((table) => db.prepare('SELECT * FROM ' + table).all());
    const digests = db
      .prepare('SELECT browser_token_digest FROM participants')
      .all()
      .map((r) => String(r.browser_token_digest));
    const url = c.server.url + `/api/activities/${c.histories[0]}/export.csv`;
    const response = await fetch(url, { headers: c.client.headers });
    const headers: string[] = [];
    response.headers.forEach((value, key) => headers.push(key + ':' + value));
    const output = JSON.stringify(headers) + (await response.text());
    for (const secret of [
      c.client.cookie,
      c.client.csrfToken,
      'invalid-demo-token',
      'test-owner-a',
      ...digests,
    ])
      expect(output).not.toContain(secret);
    expect(
      ['writeback_jobs', 'writeback_attempts', 'command_receipts', 'account_command_receipts'].map(
        (table) => db.prepare('SELECT * FROM ' + table).all(),
      ),
    ).toEqual(before);
    expect(c.googleCalls).toEqual({ read: 0, write: 0 });
  } finally {
    await c.close();
  }
});
