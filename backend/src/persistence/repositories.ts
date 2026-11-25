import type { DatabaseConnection } from './connection.js';
import { createAccountRepository } from './account-repository.js';
import { createActivityRepository } from './activity-repository.js';
import { createParticipationRepository } from './participation-repository.js';
import { createReceiptRepository } from './receipt-repository.js';
import { createWritebackRepository } from './writeback-repository.js';
import { createCommandService } from '../activity/command-service.js';

export function createRepositories(connection: DatabaseConnection, maxGroups = 100) {
  const accounts = createAccountRepository(connection, maxGroups);
  const activities = createActivityRepository(connection, maxGroups);
  return {
    accounts,
    activities,
    participation: createParticipationRepository(connection, activities),
    receipts: createReceiptRepository(connection),
    writebacks: createWritebackRepository(connection, activities),
    commands: createCommandService(connection),
  };
}
