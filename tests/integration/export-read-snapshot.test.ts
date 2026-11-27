import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createPersistenceFixture } from '../helpers/persistence.js';

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
