import { z } from 'zod';
import type { DatabaseConnection } from './connection.js';
import { AppError } from '../security/safe-errors.js';

const accountSchema = z.strictObject({
  accountId: z.string().min(1),
  displayEmail: z.string(),
  displayName: z.string(),
});
export function createAccountRepository(connection: DatabaseConnection, maxGroups: number) {
  return {
    upsert(input: z.input<typeof accountSchema>) {
      connection.requireTransaction();
      const account = accountSchema.parse(input);
      connection.database
        .prepare(
          `INSERT INTO teacher_accounts VALUES(?,?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET display_email=excluded.display_email,display_name=excluded.display_name`,
        )
        .run(account.accountId, account.displayEmail, account.displayName, Date.now());
      return account;
    },
    settings(accountId: string) {
      const row = connection.database
        .prepare('SELECT settings_json FROM teacher_settings WHERE account_id=?')
        .get(accountId);
      if (!row) return { defaultGroupCount: Math.min(2, maxGroups) };
      try {
        return z
          .strictObject({ defaultGroupCount: z.number().int().min(1).max(maxGroups) })
          .parse(JSON.parse(String(row.settings_json)));
      } catch {
        throw new AppError('STORAGE_CORRUPT');
      }
    },
    saveSettings(accountId: string, input: unknown) {
      connection.requireTransaction();
      if (
        !connection.database
          .prepare('SELECT account_id FROM teacher_accounts WHERE account_id=?')
          .get(accountId)
      )
        throw new AppError('UNAUTHORIZED');
      const settings = z
        .strictObject({ defaultGroupCount: z.number().int().min(1).max(maxGroups) })
        .parse(input);
      connection.database
        .prepare(
          `INSERT INTO teacher_settings VALUES(?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at`,
        )
        .run(accountId, JSON.stringify(settings), Date.now());
      return settings;
    },
  };
}
