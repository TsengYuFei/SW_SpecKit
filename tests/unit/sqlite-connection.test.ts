import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../backend/src/persistence/connection.js';
import { readConfig } from '../../backend/src/config.js';
import { createTemporaryDatabase } from '../helpers/temporary-database.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('uses durable PRAGMAs and validates an existing migration on reopening', () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  const first = openDatabase(temporary.databasePath);
  expect(first.database.prepare('PRAGMA journal_mode').get()).toMatchObject({
    journal_mode: 'wal',
  });
  expect(first.database.prepare('PRAGMA synchronous').get()).toMatchObject({ synchronous: 2 });
  expect(first.database.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
  expect(first.database.prepare('PRAGMA busy_timeout').get()).toMatchObject({ timeout: 2000 });
  first.close();
  const second = openDatabase(temporary.databasePath);
  cleanups.push(second.close);
  expect(
    second.database.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get(),
  ).toMatchObject({ total: 1 });
});

it('rejects corrupted files and migration tampering without replacing saved data', () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  writeFileSync(temporary.databasePath, 'not-a-database');
  expect(() => openDatabase(temporary.databasePath)).toThrow('儲存資料');
  temporary.cleanup();
  const other = createTemporaryDatabase();
  cleanups.push(other.cleanup);
  const connection = openDatabase(other.databasePath);
  connection.database.exec("UPDATE schema_migrations SET checksum='invalid-checksum'");
  connection.close();
  expect(() => openDatabase(other.databasePath)).toThrow('儲存資料');
  const inspection = new DatabaseSync(other.databasePath, { readOnly: true });
  expect(inspection.prepare('SELECT checksum FROM schema_migrations').get()).toMatchObject({
    checksum: 'invalid-checksum',
  });
  inspection.close();
});

it('rejects unknown schemas and newer migration versions', () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  const unknown = new DatabaseSync(temporary.databasePath);
  unknown.exec('CREATE TABLE unrelated (id INTEGER)');
  unknown.close();
  expect(() => openDatabase(temporary.databasePath)).toThrow('儲存資料');
  const other = createTemporaryDatabase();
  cleanups.push(other.cleanup);
  const connection = openDatabase(other.databasePath);
  connection.database.exec("INSERT INTO schema_migrations VALUES(999,0,'future')");
  connection.close();
  expect(() => openDatabase(other.databasePath)).toThrow('儲存資料');
});

it('fails safely on a read-only connection or a competing writer', () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  const connection = openDatabase(temporary.databasePath);
  cleanups.push(connection.close);
  expect(() => openDatabase(temporary.databasePath, { readOnly: true })).toThrow('儲存');
  connection.database.exec('BEGIN IMMEDIATE');
  try {
    expect(() => openDatabase(temporary.databasePath)).toThrow('儲存');
  } finally {
    connection.database.exec('ROLLBACK');
  }
});

it('rejects unsafe database configuration without echoing it', () => {
  expect(readConfig({}).DATABASE_PATH).toBe('data/classroom.sqlite');
  for (const DATABASE_PATH of [
    ':memory:',
    'file:private-example',
    '\\\\network\\private-example',
  ]) {
    expect(() => readConfig({ DATABASE_PATH })).toThrow('DATABASE_PATH');
    expect(() => readConfig({ DATABASE_PATH })).not.toThrow(DATABASE_PATH);
  }
});
