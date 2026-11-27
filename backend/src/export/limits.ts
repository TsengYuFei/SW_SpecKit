import { AppError } from '../security/safe-errors.js';
export const EXPORT_LIMITS = Object.freeze({
  rows: 1048576,
  columns: 16384,
  cellUnits: 32767,
  cellLf: 253,
  logicalCells: 1000000,
  inputBytes: 32 * 1024 * 1024,
  outputBytes: 32 * 1024 * 1024,
  cellsPerChunk: 4096,
  chunkMs: 4,
  deadlineMs: 10000,
  windowMs: 5000,
  attempts: 2,
});
export type ExportLimits = { readonly [K in keyof typeof EXPORT_LIMITS]: number };
export function within(value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new AppError('EXPORT_TOO_LARGE');
}
