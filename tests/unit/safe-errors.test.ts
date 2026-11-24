import { expect, it } from 'vitest';
import { AppError, safeError } from '../../backend/src/security/safe-errors.js';
import { createLogger } from '../../backend/src/security/logger.js';

it('returns known errors and hides unknown exception values', () => {
  expect(safeError(new AppError('FORBIDDEN'))).toMatchObject({ code: 'FORBIDDEN' });
  const secret = 'synthetic-secret-never-publish';
  expect(JSON.stringify(safeError(new Error(secret)))).not.toContain(secret);
});

it('logs only approved event metadata', () => {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));
  logger({ event: 'request_failed', code: 'FORBIDDEN', durationMs: 8, token: 'synthetic-secret' });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('FORBIDDEN');
  expect(lines[0]).not.toContain('synthetic-secret');
});
