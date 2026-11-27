import { setImmediate } from 'node:timers/promises';
import type { AnswerOrderView } from '@classroom/shared/projections/answer-order';
import { EXPORT_LIMITS, within, type ExportLimits } from './limits.js';

export function safeCellText(value: string, limits: ExportLimits = EXPORT_LIMITS) {
  const first = value.trimStart()[0] ?? '';
  const safe =
    value && (value.charCodeAt(0) < 32 || ('=+-@＝＋－＠'.includes(first) && first !== ''))
      ? '\t' + value
      : value;
  within(safe.length, limits.cellUnits);
  within((safe.match(/\n/g) ?? []).length, limits.cellLf);
  return safe;
}
export function csvLayout(order: AnswerOrderView, limits: ExportLimits = EXPORT_LIMITS) {
  const dataRowCount = order.questions.reduce((n, q) => n + q.items.length, 0);
  const aMax = order.questions.reduce((maximum, q) => Math.max(maximum, q.entries.length), 0);
  const uMax = order.questions.reduce(
    (maximum, q) => Math.max(maximum, q.unansweredGroups.length),
    0,
  );
  const columnCount = 3 + 2 * aMax + 2 * uMax;
  within(dataRowCount + 1, limits.rows);
  within(columnCount, limits.columns);
  within((dataRowCount + 1) * columnCount, limits.logicalCells);
  const headers = [
    '題號',
    '子題',
    '題目',
    ...Array.from({ length: aMax }, (_, i) => [`第${i + 1}順位組別`, `第${i + 1}順位答案`]).flat(),
    ...Array.from({ length: uMax }, (_, i) => [`未作答組別${i + 1}`, `未作答狀態${i + 1}`]).flat(),
  ];
  return { dataRowCount, aMax, uMax, columnCount, headers };
}
export async function encodeCsv(
  order: AnswerOrderView,
  options: {
    check?: () => void;
    yieldControl?: () => Promise<unknown>;
    limits?: ExportLimits;
  } = {},
) {
  const limits = options.limits ?? EXPORT_LIMITS,
    layout = csvLayout(order, limits);
  const fragments: Buffer[] = [Buffer.from('\uFEFF')];
  let bytes = 3,
    cells = 0,
    start = performance.now();
  async function row(values: string[]) {
    let text = '';
    for (const [index, value] of values.entries()) {
      const quoted =
        '"' +
        safeCellText(value, limits).replaceAll('"', '""') +
        '"' +
        (index === values.length - 1 ? '\r\n' : ',');
      bytes += Buffer.byteLength(quoted);
      within(bytes, limits.outputBytes);
      text += quoted;
      cells++;
      if (cells >= limits.cellsPerChunk || performance.now() - start >= limits.chunkMs) {
        options.check?.();
        await (options.yieldControl ?? setImmediate)();
        options.check?.();
        cells = 0;
        start = performance.now();
      }
    }
    fragments.push(Buffer.from(text));
  }
  options.check?.();
  await row(layout.headers);
  for (const question of order.questions)
    for (const [itemIndex, item] of question.items.entries()) {
      const stripped = item.label.replace(/^(?:\((.*)\)|（(.*)）)$/s, '$1$2');
      const values = [
        question.displayNumber,
        question.kind === 'single' ? '' : stripped || String(itemIndex + 1),
        item.prompt,
      ];
      for (let rank = 0; rank < layout.aMax; rank++) {
        const entry = question.entries[rank];
        values.push(entry?.fullGroupName ?? '', entry?.items[itemIndex]?.answer ?? '');
      }
      for (let index = 0; index < layout.uMax; index++) {
        const group = question.unansweredGroups[index];
        values.push(group?.fullGroupName ?? '', group ? '未作答' : '');
      }
      await row(values);
    }
  options.check?.();
  return Buffer.concat(fragments, bytes);
}
