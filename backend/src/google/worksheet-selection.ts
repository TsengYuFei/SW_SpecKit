import type { sheets_v4 } from 'googleapis';
import { AppError } from '../security/safe-errors.js';

export function chooseWorksheet(sheets: sheets_v4.Schema$Sheet[], originalSheetId?: number) {
  const matches = sheets.filter((sheet) =>
    originalSheetId === undefined
      ? sheet.properties?.index === 0
      : sheet.properties?.sheetId === originalSheetId,
  );
  if (matches.length !== 1)
    throw new AppError(originalSheetId === undefined ? 'SOURCE_UNSUPPORTED' : 'SOURCE_CONFLICT');
  const sheet = matches[0]!;
  if (sheet.properties?.sheetType && sheet.properties.sheetType !== 'GRID')
    throw new AppError('SOURCE_UNSUPPORTED');
  return sheet;
}
