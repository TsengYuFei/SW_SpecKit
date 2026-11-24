import { expect, it } from 'vitest';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';
import { parseSpreadsheetId } from '../../backend/src/activity/source-service.js';
import { sampleSheet } from '../fixtures/guided-notes.js';

it('maps grouped and single questions across renamed and shifted sheets', () => {
  const questions = parseGuidedNotes([sampleSheet(), sampleSheet(12, 5, 2)]);
  expect(questions).toHaveLength(4);
  expect(questions[0]!.items).toHaveLength(2);
  expect(questions[0]!.items[0]!.target).toMatchObject({ sheetId: 7, rowIndex: 1, columnIndex: 4 });
  expect(questions[1]!.items[0]!.target).toMatchObject({ rowIndex: 4, columnIndex: 3 });
  expect(questions[2]!.items[0]!.target).toMatchObject({
    sheetId: 12,
    rowIndex: 6,
    columnIndex: 6,
  });
  expect(new Set(questions.map((q) => q.id)).size).toBe(4);
});

it('rejects empty sheets and ambiguous group labels', () => {
  expect(() => parseGuidedNotes([])).toThrow();
  const sheet = sampleSheet();
  sheet.rows[2]![3] = { userEnteredValue: { stringValue: '（1）' } };
  expect(() => parseGuidedNotes([sheet])).toThrow();
  sheet.rows[2]![3] = { userEnteredValue: { stringValue: '(1)' } };
  expect(() => parseGuidedNotes([sheet])).toThrow();
  expect(() => parseGuidedNotes([sampleSheet(), sampleSheet()])).toThrow();
});

it('parses only Google spreadsheet URLs or bare IDs', () => {
  expect(
    parseSpreadsheetId('https://docs.google.com/spreadsheets/d/example_sheet-123/edit#gid=0'),
  ).toBe('example_sheet-123');
  expect(parseSpreadsheetId('example_sheet-123')).toBe('example_sheet-123');
  expect(() => parseSpreadsheetId('https://evil.invalid/spreadsheets/d/example')).toThrow();
  expect(() =>
    parseSpreadsheetId('https://user:pass@docs.google.com/spreadsheets/d/example'),
  ).toThrow();
});
