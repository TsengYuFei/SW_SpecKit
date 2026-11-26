import { randomUUID, createHash } from 'node:crypto';
import { constants, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { catalogClassroom } from '../helpers/activity.js';
import { createTemporaryDatabase } from '../helpers/temporary-database.js';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { openDatabase } from '../../backend/src/persistence/connection.js';

// Compare every stored row, including receipts, frozen results and durable writeback state.
function snapshot(database: DatabaseSync) {
  return Object.fromEntries(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(({ name }) => [
        String(name),
        database
          .prepare('SELECT * FROM "' + String(name).replaceAll('"', '""') + '" ORDER BY rowid')
          .all(),
      ]),
  );
}

it('backs up committed WAL data through SQLite and restores all activity rows after both service listeners stop', async () => {
  const c = await catalogClassroom();
  const target = createTemporaryDatabase();
  const database = c.server.persistence.connection.database;
  let stopped = false;
  let restored: ReturnType<typeof openDatabase> | undefined;
  let reader: DatabaseSync | undefined;
  try {
    // A reader pins the old WAL snapshot; the subsequent confirmed answer cannot rely on a main-file copy.
    database.exec('PRAGMA wal_autocheckpoint=0');
    reader = new DatabaseSync(c.server.persistence.databasePath, { readOnly: true });
    reader.exec('BEGIN');
    reader.prepare('SELECT count(*) FROM submissions').get();
    const run = (actor: typeof c.a, event: string, extra = {}) =>
      executeCommand(c.store, actor, event, {
        activityId: c.activity.id,
        requestId: randomUUID(),
        ...extra,
      });
    run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '備份甲組' });
    run(c.b, 'group:join', { groupId: c.groups[1]!.id, name: '備份乙組' });
    run(c.teacher, 'activity:start');
    for (const actor of [c.a, c.b])
      run(actor, 'answer:submit', {
        questionId: c.question.id,
        answers: Object.fromEntries(c.question.items.map((item) => [item.id, '備份完整答案'])),
      });
    run(c.teacher, 'activity:end');
    // Stop network work at a stable committed state, while SQLite and both listeners remain open.
    await c.server.worker!.stop();
    const expected = snapshot(database);
    expect(database.prepare('SELECT count(*) AS n FROM submissions').get()).toEqual({ n: 2 });
    expect(database.prepare('SELECT count(*) AS n FROM results').get()).toEqual({ n: 2 });
    expect(database.prepare('SELECT count(*) AS n FROM writeback_jobs').get()).toEqual({ n: 1 });
    const wal = database.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()!;
    expect(Number(wal.log) > Number(wal.checkpointed)).toBe(true);
    const backupPath = join(target.directory, 'snapshot.sqlite.bak');
    expect(await backup(database, backupPath)).toBeGreaterThan(0);
    reader.exec('ROLLBACK');
    reader.close();
    reader = undefined;
    await c.server.stop();
    stopped = true;
    // Restore to a fresh path only, never over a running/production database or stale WAL sidecars.
    copyFileSync(backupPath, target.databasePath, constants.COPYFILE_EXCL);
    restored = openDatabase(target.databasePath);
    expect(restored.database.prepare('PRAGMA integrity_check').all()).toEqual([
      { integrity_check: 'ok' },
    ]);
    expect(restored.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(snapshot(restored.database)).toEqual(expected);
  } finally {
    reader?.close();
    restored?.close();
    if (!stopped) await c.server.stop();
    target.cleanup();
  }
});

it('refuses a corrupt restore candidate without replacing or recreating its contents', () => {
  const target = createTemporaryDatabase();
  try {
    writeFileSync(target.databasePath, 'invalid-demo-corrupt-sqlite');
    const digest = () =>
      createHash('sha256').update(readFileSync(target.databasePath)).digest('hex');
    const before = digest();
    expect(() => openDatabase(target.databasePath)).toThrowError(
      expect.objectContaining({ code: 'STORAGE_CORRUPT' }),
    );
    expect(digest()).toBe(before);
  } finally {
    target.cleanup();
  }
});

it('refuses a readable backup with broken foreign keys instead of treating integrity_check alone as sufficient', async () => {
  const c = await catalogClassroom();
  const target = createTemporaryDatabase();
  try {
    await backup(c.server.persistence.connection.database, target.databasePath);
    const candidate = new DatabaseSync(target.databasePath);
    try {
      candidate.exec('PRAGMA foreign_keys=OFF');
      candidate.exec('DELETE FROM teacher_accounts');
      expect(candidate.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(candidate.prepare('PRAGMA foreign_key_check').all().length).toBeGreaterThan(0);
    } finally {
      candidate.close();
    }
    expect(() => openDatabase(target.databasePath)).toThrowError(
      expect.objectContaining({ code: 'STORAGE_CORRUPT' }),
    );
    expect(c.server.persistence.activities.require(c.activity.id).ownerAccountId).not.toBe(
      'missing-owner',
    );
  } finally {
    await c.server.stop();
    target.cleanup();
  }
});
