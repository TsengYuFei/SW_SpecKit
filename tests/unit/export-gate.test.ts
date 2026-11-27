import { expect, it } from 'vitest';
import { createExportGate } from '../../backend/src/export/export-gate.js';
it('admits one generator, counts only admitted attempts, isolates sessions and releases on errors', () => {
  let now = 0;
  const gate = createExportGate(() => now);
  const first = gate.acquire('invalid-demo-a');
  expect(() => gate.acquire('invalid-demo-b')).toThrowError(
    expect.objectContaining({ code: 'EXPORT_BUSY', retryAfter: 1 }),
  );
  first.release();
  first.release();
  gate.acquire('invalid-demo-a').release();
  expect(() => gate.acquire('invalid-demo-a')).toThrowError(
    expect.objectContaining({ code: 'RATE_LIMITED', retryAfter: 5 }),
  );
  const other = gate.acquire('invalid-demo-b');
  now = 10001;
  expect(() => other.check()).toThrowError(expect.objectContaining({ code: 'EXPORT_BUSY' }));
  other.release();
  gate.acquire('invalid-demo-a').release();
  const lease = gate.acquire('invalid-demo-c');
  expect(() => lease.check(AbortSignal.abort())).toThrow();
  lease.release();
});
