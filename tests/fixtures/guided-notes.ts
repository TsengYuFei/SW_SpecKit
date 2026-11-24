import type { GridSheet } from '../../shared/src/schemas/source.js';

export function sampleSheet(id = 7, rowOffset = 0, columnOffset = 0): GridSheet {
  const rows: GridSheet['rows'] = [];
  const put = (r: number, c: number, value: string) => {
    rows[r + rowOffset] ??= [];
    rows[r + rowOffset]![c + columnOffset] = { userEnteredValue: { stringValue: value } };
  };
  put(0, 0, '題號');
  put(0, 1, '題目');
  put(0, 3, '作答');
  put(1, 0, '1');
  put(1, 1, '第一個小題');
  put(1, 3, '（1）');
  put(2, 1, '第二個小題');
  put(2, 3, '（2）');
  put(4, 0, '2');
  put(4, 1, '單題');
  const range = (r: number, c: number, height: number, width: number) => ({
    sheetId: id,
    startRowIndex: r + rowOffset,
    endRowIndex: r + rowOffset + height,
    startColumnIndex: c + columnOffset,
    endColumnIndex: c + columnOffset + width,
  });
  return {
    sheetId: id,
    title: `教材 ${id}`,
    rows: Array.from({ length: rows.length }, (_, i) => rows[i] ?? []),
    merges: [range(0, 1, 1, 2), range(0, 3, 1, 2), range(1, 0, 2, 1), range(4, 3, 1, 2)],
  };
}
