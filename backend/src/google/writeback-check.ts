import type { Question, GridSheet, CellValue } from '@classroom/shared/schemas/source';
import { parseGuidedNotes } from './guided-notes-parser.js';
export function classifyWriteback(
  original: Question,
  expected: Record<string, string>,
  sheet: GridSheet,
): 'expected' | 'baseline' | 'conflict' {
  const actual = parseGuidedNotes([sheet]).find((question) => question.id === original.id);
  const structure = (question: Question) =>
    JSON.stringify({
      ...question,
      items: question.items.map(({ baselineValue: _baseline, ...item }) => item),
    });
  if (!actual || structure(actual) !== structure(original)) return 'conflict';
  const key = (cell: CellValue | null) =>
    JSON.stringify(
      Object.entries(cell ?? {})
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  if (
    actual.items.every(
      (item) => key(item.baselineValue) === key({ stringValue: expected[item.id]! }),
    )
  )
    return 'expected';
  return actual.items.every(
    (item) =>
      key(item.baselineValue) ===
      key(original.items.find((before) => before.id === item.id)!.baselineValue),
  )
    ? 'baseline'
    : 'conflict';
}
