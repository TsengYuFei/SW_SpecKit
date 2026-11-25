import { expect, it } from 'vitest';
import { chooseWorksheet } from '../../backend/src/google/worksheet-selection.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';
import { sampleSheet } from '../fixtures/guided-notes.js';

it('selects index zero even when metadata array order differs or the worksheet is hidden', () => {
  const first = {
    properties: { sheetId: 17, index: 0, title: '首張', sheetType: 'GRID', hidden: true },
  };
  const second = { properties: { sheetId: 29, index: 1, title: '第二張', sheetType: 'GRID' } };
  expect(chooseWorksheet([second, first])).toBe(first);
});
it('does not fall back from an unsupported or empty first worksheet', () => {
  expect(() =>
    chooseWorksheet([
      { properties: { sheetId: 17, index: 0, sheetType: 'OBJECT' } },
      { properties: { sheetId: 29, index: 1, sheetType: 'GRID' } },
    ]),
  ).toThrow('第一個工作表');
  const first = sampleSheet(17);
  first.rows = [];
  first.merges = [];
  expect(() => parseGuidedNotes([first])).toThrow();
});
it('keeps the saved sheet ID after reordering and reports deletion instead of selecting a replacement', () => {
  const original = { properties: { sheetId: 17, index: 1, sheetType: 'GRID' } };
  const replacement = { properties: { sheetId: 29, index: 0, sheetType: 'GRID' } };
  expect(chooseWorksheet([replacement, original], 17)).toBe(original);
  expect(() => chooseWorksheet([replacement], 17)).toThrow('來源教材');
});
