import { createTemporaryDatabase, openTemporaryDatabase } from './temporary-database.js';
import { openDatabase } from '../../backend/src/persistence/connection.js';
import { createRepositories } from '../../backend/src/persistence/repositories.js';

export function createPersistenceFixture(directory?: string) {
  const temporary = directory ? openTemporaryDatabase(directory) : createTemporaryDatabase();
  const connection = openDatabase(temporary.databasePath);
  const repositories = createRepositories(connection);
  return {
    ...temporary,
    connection,
    ...repositories,
    close() {
      connection.close();
      temporary.cleanup();
    },
  };
}
export type PersistenceFixture = ReturnType<typeof createPersistenceFixture>;
