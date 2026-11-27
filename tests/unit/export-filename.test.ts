import { expect, it } from 'vitest';
import { exportFilename } from '../../backend/src/export/filename.js';
const id = '11111111-1111-4111-8111-111111111111';
it('uses full UUID, saved title and fixed Taiwan midnight even on other host timezones', () => {
  expect(exportFilename('教材', id, Date.parse('2026-11-26T15:59:59Z')).filename).toBe(
    `搶答結果_教材_${id}_20261126-235959.csv`,
  );
  expect(exportFilename('教材', id, Date.parse('2026-11-26T16:00:00Z')).filename).toBe(
    `搶答結果_教材_${id}_20261127-000000.csv`,
  );
});
it('sanitizes titles only, respects both 240 budgets and encodes RFC8187 attr-char exceptions', () => {
  const result = exportFilename("教材'(*)/\r\n" + '😀'.repeat(300), id, 0);
  expect(Buffer.byteLength(result.filename)).toBeLessThanOrEqual(240);
  expect(result.filename.length).toBeLessThanOrEqual(240);
  expect(result.filename).not.toMatch(/[\r\n/]/);
  expect(result.filename).toContain(id);
  // Windows forbids '*': sanitize it before RFC8187 encodes the remaining quote/parentheses.
  expect(result.disposition).toContain('%27%28_%29');
  expect(result.disposition).toMatch(/^attachment; filename="buzzer_results_/);
  expect(exportFilename(' ...', id, 0).filename).toContain('未命名活動');
});
