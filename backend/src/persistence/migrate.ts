import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../security/safe-errors.js';
import { coreSchema } from './migrations/001-core.js';

export function migrate(database: DatabaseSync, existed: boolean) {
  const registered = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get();
  if (existed && !registered) throw new AppError('STORAGE_CORRUPT');
  const checksum = createHash('sha256').update(coreSchema).digest('hex');
  if (registered) {
    const applied = database
      .prepare('SELECT version,checksum FROM schema_migrations ORDER BY version')
      .all();
    if (applied.length !== 1 || applied[0]!.version !== 1 || applied[0]!.checksum !== checksum)
      throw new AppError('STORAGE_CORRUPT');
    return;
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(
      'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL,checksum TEXT NOT NULL) STRICT',
    );
    database.exec(coreSchema);
    database.prepare('INSERT INTO schema_migrations VALUES(1,?,?)').run(Date.now(), checksum);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
