import { expect, it } from 'vitest';
import { encodeCsv, csvLayout, safeCellText } from '../../backend/src/export/csv.js';
import { EXPORT_LIMITS } from '../../backend/src/export/limits.js';
import { deriveAnswerOrder } from '../../shared/src/projections/answer-order.js';
import { resultExportFixture } from '../helpers/result-export.js';

it('exports all three canonical item rows with one BOM, fixed headers and shared grouped ranks', async () => {
  const c = await resultExportFixture();
  try {
    const order = deriveAnswerOrder(c.snapshot(c.histories[0]!));
    expect(csvLayout(order)).toMatchObject({ dataRowCount: 3, aMax: 2, uMax: 1, columnCount: 9 });
    const bytes = await encodeCsv(order);
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(bytes.toString('utf8')).toBe(
      '\uFEFF"題號","子題","題目","第1順位組別","第1順位答案","第2順位組別","第2順位答案","未作答組別1","未作答狀態1"\r\n"1","","3+4？","第2組-乙組","7","第1組-甲組","8","第3組","未作答"\r\n"2","1","水的化學式？","第1組-甲組","H₂O","第2組-乙組","HO₂","第3組","未作答"\r\n"2","2","水的沸點？","第1組-甲組","100°C","第2組-乙組","90°C","第3組","未作答"\r\n',
    );
    order.questions[0]!.entries[0]!.items[0]!.answer = '中文😀,"引號"\n第二行';
    expect((await encodeCsv(order)).toString()).toContain('"中文😀,""引號""\n第二行"');
    const zero = deriveAnswerOrder({ ...c.snapshot(c.histories[0]!), submissions: [] });
    expect(csvLayout(zero)).toMatchObject({ aMax: 0, uMax: 3, columnCount: 9 });
  } finally {
    await c.close();
  }
});

it.each([
  '=1+1',
  '+1',
  '-1',
  '@SUM(1,1)',
  '＝1',
  ' ＋1',
  '\uFEFF－1',
  '\tplain',
  '\rplain',
  '\nplain',
])('protects risky text without trimming %j', (s) => {
  expect(safeCellText(s)).toBe('\t' + s);
});
it('enforces safe-cell boundaries and leaves ordinary values intact', () => {
  expect(safeCellText('中文😀')).toBe('中文😀');
  expect(safeCellText('')).toBe('');
  expect(safeCellText('字'.repeat(32767))).toHaveLength(32767);
  expect(() => safeCellText('字'.repeat(32768))).toThrowError(
    expect.objectContaining({ code: 'EXPORT_TOO_LARGE' }),
  );
  expect(() => safeCellText('='.repeat(32767))).toThrow();
  expect(safeCellText('x' + '\n'.repeat(253))).toBe('x' + '\n'.repeat(253));
  expect(() => safeCellText('x' + '\n'.repeat(254))).toThrow();
  expect(EXPORT_LIMITS.outputBytes).toBe(32 * 1024 * 1024);
});

it('checks independent maxima, column/row/cell/byte limits without letting smaller bounds hide them', async () => {
  const c = await resultExportFixture();
  try {
    const order = deriveAnswerOrder(c.snapshot(c.histories[0]!));
    order.questions[0]!.entries = [];
    order.questions[0]!.unansweredGroups = Array(8188).fill(
      order.questions[0]!.unansweredGroups[0]!,
    );
    const isolated = {
      ...EXPORT_LIMITS,
      logicalCells: Number.MAX_SAFE_INTEGER,
      outputBytes: Number.MAX_SAFE_INTEGER,
    };
    expect(csvLayout(order, isolated)).toMatchObject({ aMax: 2, uMax: 8188, columnCount: 16383 });
    order.questions[0]!.unansweredGroups.push(order.questions[0]!.unansweredGroups[0]!);
    expect(() => csvLayout(order, isolated)).toThrowError(
      expect.objectContaining({ code: 'EXPORT_TOO_LARGE' }),
    );
    const normal = deriveAnswerOrder(c.snapshot(c.histories[0]!));
    expect(csvLayout(normal, { ...EXPORT_LIMITS, logicalCells: 36 })).toMatchObject({
      columnCount: 9,
    });
    expect(() => csvLayout(normal, { ...EXPORT_LIMITS, logicalCells: 35 })).toThrow();
    const bytes = await encodeCsv(normal);
    expect(
      await encodeCsv(normal, { limits: { ...EXPORT_LIMITS, outputBytes: bytes.length } }),
    ).toEqual(bytes);
    await expect(
      encodeCsv(normal, { limits: { ...EXPORT_LIMITS, outputBytes: bytes.length - 1 } }),
    ).rejects.toThrow();
    normal.questions = [normal.questions[0]!];
    normal.questions[0]!.items = Array(1048575).fill(normal.questions[0]!.items[0]!);
    expect(csvLayout(normal, isolated).dataRowCount).toBe(1048575);
    normal.questions[0]!.items.push(normal.questions[0]!.items[0]!);
    expect(() => csvLayout(normal, isolated)).toThrow();
  } finally {
    await c.close();
  }
});
