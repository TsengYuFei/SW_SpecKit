import { createTemporaryDatabase, openTemporaryDatabase } from './temporary-database.js';

function wrap(database: ReturnType<typeof createTemporaryDatabase>) {
  return Object.freeze({
    ...database,
    env: Object.freeze({ DATABASE_PATH: database.databasePath }),
    webServerEnv(values: Record<string, string>) {
      if (values.DATABASE_PATH && values.DATABASE_PATH !== database.databasePath)
        throw new Error('測試服務不得覆寫隔離資料庫路徑');
      return { ...values, DATABASE_PATH: database.databasePath };
    },
  });
}

export function createPlaywrightDatabase() {
  return wrap(createTemporaryDatabase());
}

export function playwrightDatabaseForRun() {
  const inheritedDirectory = process.env.CLASSROOM_E2E_DATABASE_DIRECTORY;
  if (inheritedDirectory) return wrap(openTemporaryDatabase(inheritedDirectory));
  const database = createPlaywrightDatabase();
  process.env.CLASSROOM_E2E_DATABASE_DIRECTORY = database.directory;
  // Only the config-owning process cleans up, after Playwright stops its web server.
  // Worker processes reuse the inherited directory and never register this hook.
  process.once('exit', () => {
    try {
      database.cleanup();
    } catch {
      console.error('無法清理隔離測試資料庫目錄');
      process.exitCode = 1;
    }
  });
  return database;
}
