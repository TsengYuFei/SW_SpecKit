import { z } from 'zod';

export const cellValueSchema = z
  .strictObject({
    stringValue: z.string().optional(),
    numberValue: z.number().optional(),
    boolValue: z.boolean().optional(),
    formulaValue: z.string().optional(),
  })
  .refine((value) => Object.values(value).filter((v) => v !== undefined).length <= 1);
export const gridRangeSchema = z
  .strictObject({
    sheetId: z.number().int().nonnegative(),
    startRowIndex: z.number().int().nonnegative(),
    endRowIndex: z.number().int().positive(),
    startColumnIndex: z.number().int().nonnegative(),
    endColumnIndex: z.number().int().positive(),
  })
  .refine((r) => r.endRowIndex > r.startRowIndex && r.endColumnIndex > r.startColumnIndex);
export const gridSheetSchema = z.strictObject({
  sheetId: z.number().int().nonnegative(),
  title: z.string(),
  rows: z.array(
    z
      .array(
        z
          .object({
            userEnteredValue: cellValueSchema.optional(),
            formattedValue: z.string().optional(),
          })
          .default({}),
      )
      .default([]),
  ),
  merges: z.array(gridRangeSchema),
});
export type GridRange = z.infer<typeof gridRangeSchema>;
export type GridSheet = z.infer<typeof gridSheetSchema>;
export type CellValue = z.infer<typeof cellValueSchema>;
export const targetSchema = z.strictObject({
  sheetId: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  columnIndex: z.number().int().nonnegative(),
  mergeRange: gridRangeSchema.nullable(),
});
export const itemSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string(),
  prompt: z.string().min(1),
  target: targetSchema,
  baselineValue: cellValueSchema.nullable(),
});
export const questionSchema = z.strictObject({
  id: z.string().min(1),
  displayNumber: z.string().min(1),
  kind: z.enum(['single', 'group']),
  items: z.array(itemSchema).min(1),
});
export type Question = z.infer<typeof questionSchema>;
export const sourceSchema = z.strictObject({
  spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  sheetIds: z.array(z.number().int().nonnegative()),
  baseline: z.array(gridSheetSchema),
  mappingVersion: z.number().int().positive(),
  confirmed: z.boolean(),
  loadState: z.enum(['empty', 'loading', 'ready', 'error']),
});
export type Source = z.infer<typeof sourceSchema>;

export const sourcePreviewSchema = z.strictObject({
  activityId: z.uuid(),
  phase: z.enum(['waiting', 'active', 'ended']),
  groupCount: z.number().int().positive(),
  source: z
    .strictObject({
      spreadsheetId: z.string(),
      mappingVersion: z.number().int().positive(),
      confirmed: z.boolean(),
      loadState: z.enum(['empty', 'loading', 'ready', 'error']),
      questions: z.array(questionSchema),
    })
    .nullable(),
});
export type SourcePreview = z.infer<typeof sourcePreviewSchema>;
