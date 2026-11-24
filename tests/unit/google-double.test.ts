import { expect, it } from 'vitest';
import { deferred, googleReadDouble } from '../helpers/google-adapter.js';

it('controls asynchronous Google read completion', async () => {
  const result = deferred<string>();
  const adapter = googleReadDouble(() => result.promise);
  const pending = adapter.read('example-sheet');
  expect(adapter.calls).toEqual(['example-sheet']);
  result.resolve('grid');
  await expect(pending).resolves.toBe('grid');
});

it('controls Google read failures', async () => {
  const adapter = googleReadDouble(async () => {
    throw new Error('synthetic network failure');
  });
  await expect(adapter.read('example-sheet')).rejects.toThrow('synthetic network failure');
});
