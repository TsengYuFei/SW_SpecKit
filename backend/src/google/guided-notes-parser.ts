import {
  questionSchema,
  type GridSheet,
  type GridRange,
  type Question,
} from '@classroom/shared/schemas/source';
import { AppError } from '../security/safe-errors.js';

function text(sheet: GridSheet, r: number, c: number): string {
  const cell = sheet.rows[r]?.[c];
  const value = cell?.userEnteredValue;
  return String(
    cell?.formattedValue ?? value?.stringValue ?? value?.numberValue ?? value?.boolValue ?? '',
  ).trim();
}
function mergeAt(sheet: GridSheet, r: number, c: number): GridRange | undefined {
  return sheet.merges.find(
    (m) =>
      r >= m.startRowIndex && r < m.endRowIndex && c >= m.startColumnIndex && c < m.endColumnIndex,
  );
}
function ambiguous(): never {
  throw new AppError('MAPPING_AMBIGUOUS');
}

export function parseGuidedNotes(sheets: GridSheet[]): Question[] {
  const questions: Question[] = [];
  const targets = new Set<string>();
  for (const sheet of sheets) {
    let columns: { number: number; prompt: number; answer: number; answerEnd: number } | undefined;
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const numberCol = row.findIndex((_cell, c) => text(sheet, r, c) === '題號');
      if (numberCol >= 0) {
        const promptCol = row.findIndex((_cell, c) => text(sheet, r, c) === '題目');
        const answerCol = row.findIndex((_cell, c) => text(sheet, r, c) === '作答');
        if (promptCol < 0 || answerCol < 0 || !(numberCol < promptCol && promptCol < answerCol))
          ambiguous();
        columns = {
          number: numberCol,
          prompt: promptCol,
          answer: answerCol,
          answerEnd: mergeAt(sheet, r, answerCol)?.endColumnIndex ?? answerCol + 1,
        };
        continue;
      }
      if (!columns) continue;
      const displayNumber = text(sheet, r, columns.number);
      if (!displayNumber) {
        if (text(sheet, r, columns.prompt)) ambiguous();
        continue;
      }
      const numberMerge = mergeAt(sheet, r, columns.number);
      if (
        numberMerge &&
        (numberMerge.startRowIndex !== r ||
          numberMerge.startColumnIndex !== columns.number ||
          numberMerge.endColumnIndex !== columns.number + 1)
      )
        ambiguous();
      const endRow = numberMerge?.endRowIndex ?? r + 1;
      if (endRow > sheet.rows.length) ambiguous();
      const grouped = endRow > r + 1;
      const id = `${sheet.sheetId}:${r}:${columns.number}`;
      const items: Question['items'] = [];
      const labels = new Set<string>();
      for (let itemRow = r; itemRow < endRow; itemRow++) {
        const prompt = text(sheet, itemRow, columns.prompt);
        const label = grouped ? text(sheet, itemRow, columns.answer) : '';
        if (!prompt || (grouped && !/^[（(]\d+[）)]$/.test(label))) ambiguous();
        const labelKey = grouped ? String(Number(label.match(/\d+/)?.[0])) : '';
        if (labels.has(labelKey)) ambiguous();
        labels.add(labelKey);
        const columnIndex = columns.answer + (grouped ? 1 : 0);
        if (columnIndex >= columns.answerEnd) ambiguous();
        const targetMerge = mergeAt(sheet, itemRow, columnIndex);
        if (
          targetMerge &&
          (targetMerge.startRowIndex !== itemRow ||
            targetMerge.startColumnIndex !== columnIndex ||
            targetMerge.endRowIndex !== itemRow + 1)
        )
          ambiguous();
        if ((targetMerge?.endColumnIndex ?? columnIndex + 1) !== columns.answerEnd) ambiguous();
        const targetId = `${sheet.sheetId}:${itemRow}:${columnIndex}`;
        if (targets.has(targetId)) ambiguous();
        targets.add(targetId);
        items.push({
          id: targetId,
          label,
          prompt,
          target: {
            sheetId: sheet.sheetId,
            rowIndex: itemRow,
            columnIndex,
            mergeRange: targetMerge ?? null,
          },
          baselineValue: sheet.rows[itemRow]?.[columnIndex]?.userEnteredValue ?? null,
        });
      }
      questions.push(
        questionSchema.parse({ id, displayNumber, kind: grouped ? 'group' : 'single', items }),
      );
      r = endRow - 1;
    }
  }
  if (!questions.length) ambiguous();
  return questions;
}
