import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createPersistenceFixture } from '../helpers/persistence.js';
import { resultExportFixture } from '../helpers/result-export.js';
import { readExportSnapshot } from '../../backend/src/persistence/result-export-reader.js';
import { durableSourceFingerprint } from '../../backend/src/persistence/activity-repository.js';

it('reads one WAL snapshot while another connection commits, then sees the newer committed value', () => {
  const p = createPersistenceFixture();
  const other = new DatabaseSync(p.databasePath);
  try {
    p.connection.database.exec(
      'CREATE TABLE export_probe(value INTEGER); INSERT INTO export_probe VALUES(1)',
    );
    const get = () => p.connection.database.prepare('SELECT value FROM export_probe').get()!.value;
    expect(
      p.connection.readSnapshot(() => {
        expect(get()).toBe(1);
        other.exec('UPDATE export_probe SET value=2');
        return get();
      }),
    ).toBe(1);
    expect(get()).toBe(2);
    expect(p.connection.database.prepare('PRAGMA query_only').get()!.query_only).toBe(0);
  } finally {
    other.close();
    p.close();
  }
});

it.each(['missing-answer', 'missing-nonwinner', 'missing-result'] as const)(
  'rejects corrupt export snapshot: %s',
  async (fault) => {
    const c = await resultExportFixture();
    try {
      const id = c.histories[0]!;
      c.injectFault(id, fault);
      expect(() =>
        readExportSnapshot(c.server.persistence, id, 'test-owner-a', Date.now()),
      ).toThrowError(expect.objectContaining({ code: 'STORAGE_CORRUPT' }));
    } finally {
      await c.close();
    }
  },
);

it.each(['fingerprint', 'normalized-question', 'title', 'source', 'ordinal'] as const)(
  'rejects source/normalized inconsistency: %s',
  async (fault) => {
    const c = await resultExportFixture();
    try {
      const id = c.histories[0]!,
        db = c.server.persistence.connection.database;
      c.server.persistence.connection.transaction(() => {
        if (fault === 'fingerprint')
          db.prepare("UPDATE activities SET source_fingerprint='invalid-demo' WHERE id=?").run(id);
        if (fault === 'normalized-question')
          db.prepare("UPDATE question_items SET prompt='合成外部更動' WHERE activity_id=?").run(id);
        if (fault === 'title')
          db.prepare("UPDATE activities SET spreadsheet_title='合成改名' WHERE id=?").run(id);
        if (fault === 'source')
          db.prepare("UPDATE activities SET source_snapshot_json='{}' WHERE id=?").run(id);
        if (fault === 'ordinal')
          db.prepare('UPDATE activity_groups SET ordinal=4 WHERE activity_id=? AND ordinal=3').run(
            id,
          );
      });
      expect(() =>
        readExportSnapshot(c.server.persistence, id, 'test-owner-a', Date.now()),
      ).toThrowError(expect.objectContaining({ code: 'STORAGE_CORRUPT' }));
    } finally {
      await c.close();
    }
  },
);

it('treats an unparseable saved sheet as corrupt storage even with a matching fingerprint', async () => {
  const c = await resultExportFixture();
  try {
    const id = c.histories[0]!,
      db = c.server.persistence.connection.database;
    const source = JSON.parse(
      String(
        db.prepare('SELECT source_snapshot_json FROM activities WHERE id=?').get(id)!
          .source_snapshot_json,
      ),
    );
    source.sheet.rows = [];
    c.server.persistence.connection.transaction(() =>
      db
        .prepare('UPDATE activities SET source_snapshot_json=?,source_fingerprint=? WHERE id=?')
        .run(JSON.stringify(source), durableSourceFingerprint(source), id),
    );
    expect(() =>
      readExportSnapshot(c.server.persistence, id, 'test-owner-a', Date.now()),
    ).toThrowError(expect.objectContaining({ code: 'STORAGE_CORRUPT' }));
  } finally {
    await c.close();
  }
});

it('rejects writes, nested operations, Promise callbacks and hooks, restoring all flags after every failure', () => {
  const p = createPersistenceFixture();
  try {
    const c = p.connection;
    const failures = [
      () => c.database.exec('UPDATE runtime_state SET current_activity_id=NULL'),
      () => c.transaction(() => null),
      () => c.readSnapshot(() => null),
      () =>
        c.afterCommit(() => {
          throw new Error('invalid-demo-hook');
        }),
      () => c.requireTransaction(),
      () => Promise.resolve(1),
      () => Promise.reject(new Error('invalid-demo-private-rejection')),
      () => ({ then: () => 1 }),
      () => {
        throw new Error('invalid-demo-internal');
      },
      () => c.close(),
    ];
    for (const callback of failures) {
      expect(() => c.readSnapshot(callback)).toThrow();
      expect(c.inTransaction).toBe(false);
      expect(c.database.prepare('PRAGMA query_only').get()!.query_only).toBe(0);
      expect(c.readSnapshot(() => 42)).toBe(42);
      expect(
        c.transaction(() => {
          c.requireTransaction();
          return 7;
        }),
      ).toBe(7);
    }
    c.database.exec('PRAGMA query_only=ON');
    expect(c.readSnapshot(() => 9)).toBe(9);
    expect(c.database.prepare('PRAGMA query_only').get()!.query_only).toBe(1);
    expect(() =>
      c.readSnapshot(() => {
        throw new Error('invalid-demo');
      }),
    ).toThrow();
    expect(c.database.prepare('PRAGMA query_only').get()!.query_only).toBe(1);
    c.database.exec('PRAGMA query_only=OFF');
    c.transaction(() => expect(() => c.readSnapshot(() => null)).toThrow());
  } finally {
    p.close();
  }
});
