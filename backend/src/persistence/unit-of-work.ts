import type { DatabaseConnection } from './connection.js';

export function createUnitOfWork(connection: DatabaseConnection) {
  return {
    run: <T>(action: () => T) => connection.transaction(action),
    afterCommit: (action: () => void) => connection.afterCommit(action),
  };
}
