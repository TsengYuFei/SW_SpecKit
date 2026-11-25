import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ErrorCode } from '@classroom/shared/schemas/common';
import { errorCodeSchema } from '@classroom/shared/schemas/common';
import type { DatabaseConnection } from './connection.js';
import { AppError } from '../security/safe-errors.js';

export function businessJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype) {
      const entries = Object.entries(input).sort(([a], [b]) => a.localeCompare(b));
      if (
        entries.some(([key]) =>
          /^(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|cookie|authorization|csrf[_-]?token|headers|credentials|sessionId)$/i.test(
            key,
          ),
        )
      )
        throw new AppError('INVALID_INPUT');
      return Object.fromEntries(entries.map(([key, value]) => [key, canonical(value)]));
    }
    throw new AppError('INVALID_INPUT');
  }
  return JSON.stringify(canonical(value ?? null));
}
export interface ActivityCommand {
  activityId: string;
  actorKey: string;
  event: string;
  requestId: string;
  payload: unknown;
}
export interface AccountCommand {
  ownerAccountId: string;
  event: string;
  requestId: string;
  payload: unknown;
}
export type ReceiptOutcome = { ok: true; data: unknown } | { ok: false; error: ErrorCode };
const outcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorCodeSchema }),
]);
export function createReceiptRepository(connection: DatabaseConnection) {
  const db = connection.database;
  function key(command: ActivityCommand | AccountCommand) {
    z.uuid().parse(command.requestId);
    z.string().min(1).parse(command.event);
    return 'activityId' in command
      ? {
          table: 'command_receipts',
          predicate: 'activity_id=? AND actor_key=? AND event=? AND request_id=?',
          values: [
            z.uuid().parse(command.activityId),
            z.string().min(1).parse(command.actorKey),
            command.event,
            command.requestId,
          ],
        }
      : {
          table: 'account_command_receipts',
          predicate: 'owner_account_id=? AND event=? AND request_id=?',
          values: [
            z.string().min(1).parse(command.ownerAccountId),
            command.event,
            command.requestId,
          ],
        };
  }
  return {
    fingerprint: (payload: unknown) =>
      createHash('sha256').update(businessJson(payload)).digest('hex'),
    get(command: ActivityCommand | AccountCommand) {
      const scope = key(command);
      const row = db
        .prepare(
          `SELECT payload_fingerprint,outcome_json FROM ${scope.table} WHERE ${scope.predicate}`,
        )
        .get(...scope.values);
      if (!row) return undefined;
      try {
        return {
          fingerprint: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(row.payload_fingerprint),
          outcome: outcomeSchema.parse(JSON.parse(String(row.outcome_json))),
        };
      } catch {
        throw new AppError('STORAGE_CORRUPT');
      }
    },
    save(command: ActivityCommand | AccountCommand, fingerprint: string, outcome: ReceiptOutcome) {
      connection.requireTransaction();
      const scope = key(command);
      const columns =
        scope.table === 'command_receipts'
          ? 'activity_id,actor_key,event,request_id'
          : 'owner_account_id,event,request_id';
      const values = [...scope.values, fingerprint, businessJson(outcome), Date.now()];
      db.prepare(
        `INSERT INTO ${scope.table}(${columns},payload_fingerprint,outcome_json,created_at) VALUES(${values.map(() => '?').join(',')})`,
      ).run(...values);
    },
  };
}
