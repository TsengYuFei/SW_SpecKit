import { expect, it } from 'vitest';
import { googleError, readWithRetry } from '../../backend/src/google/sheets-client.js';

it('distinguishes transport errors without exposing their details', () => {
  expect(googleError({ code: 'ENOTFOUND', message: 'synthetic-secret' }).code).toBe(
    'NETWORK_ERROR',
  );
  expect(googleError({ code: 'ECONNRESET' }).code).toBe('NETWORK_ERROR');
});

it.each([
  [400, 'INVALID_INPUT'],
  [401, 'GOOGLE_AUTH_REQUIRED'],
  [403, 'GOOGLE_FORBIDDEN'],
  [404, 'SHEET_NOT_FOUND_OR_INACCESSIBLE'],
  [429, 'RATE_LIMITED'],
  [503, 'GOOGLE_ERROR'],
])('maps Google status %s safely', (status, code) => {
  const result = googleError({ response: { status }, message: 'synthetic-secret' });
  expect(result.code).toBe(code);
  expect(result.message).not.toContain('synthetic-secret');
});

it('retries transient failures at most three times and never retries authorization errors', async () => {
  let calls = 0;
  await expect(
    readWithRetry(
      async () => {
        calls++;
        throw { response: { status: 503 } };
      },
      async () => {},
    ),
  ).rejects.toMatchObject({ code: 'GOOGLE_ERROR' });
  expect(calls).toBe(4);
  calls = 0;
  await expect(
    readWithRetry(
      async () => {
        calls++;
        throw { response: { status: 401 } };
      },
      async () => {},
    ),
  ).rejects.toMatchObject({ code: 'GOOGLE_AUTH_REQUIRED' });
  expect(calls).toBe(1);
});
