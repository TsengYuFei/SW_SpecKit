import { expect, it } from 'vitest';
import { errorCodeSchema } from '../../shared/src/schemas/common.js';
import { AppError, safeError } from '../../backend/src/security/safe-errors.js';
import { createLogger } from '../../backend/src/security/logger.js';

it.each([
  ['EXPORT_BUSY', 503, true],
  ['EXPORT_TOO_LARGE', 422, false],
] as const)('maps %s to a fixed safe error and logger allowlist', (code, status, retryable) => {
  expect(errorCodeSchema.parse(code)).toBe(code);
  const error = new AppError(code);
  expect(error.status).toBe(status);
  expect(safeError(error)).toMatchObject({ code, retryable });
  const lines: string[] = [];
  createLogger((line) => lines.push(line))({
    event: 'request_failed',
    code,
    durationMs: 2,
    payload: 'invalid-demo-private',
    headers: { cookie: 'invalid-demo-cookie' },
  });
  expect(JSON.parse(lines[0]!)).toEqual({ event: 'request_failed', code, durationMs: 2 });
  expect(JSON.stringify(safeError(new Error('invalid-demo-private')))).not.toContain(
    'invalid-demo-private',
  );
});
