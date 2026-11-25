import { expect, it } from 'vitest';
import { newRequestId } from '../../frontend/src/transport/request-id.js';
import { idSchema } from '../../shared/src/schemas/common.js';

it('uses the native UUID generator when available', () => {
  const id = crypto.randomUUID();
  expect(
    newRequestId({
      randomUUID: () => id,
      getRandomValues: () => {
        throw new Error('unexpected fallback');
      },
    }),
  ).toBe(id);
});

it('generates valid UUID v4 IDs with secure random bytes when HTTP has no randomUUID', () => {
  const source = { getRandomValues: (bytes: Uint8Array) => crypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 100 }, () => newRequestId(source));
  expect(new Set(ids).size).toBe(100);
  for (const id of ids) {
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(id[14]).toBe('4');
    expect(id[19]).toMatch(/[89ab]/);
  }
});

it('provides a readable failure when secure random generation is unavailable', () => {
  expect(() => newRequestId({})).toThrow('安全請求編號');
});
