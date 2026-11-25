import { z } from 'zod';
import { questionSchema, sourcePreviewSchema } from './source.js';
import { groupCountSchema, idSchema } from './common.js';

export const spreadsheetIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const spreadsheetCandidateSchema = z.strictObject({
  id: spreadsheetIdSchema,
  name: z.string(),
  canEdit: z.boolean(),
  modifiedTime: z.string().optional(),
  ownerLabel: z.string().optional(),
});
export type SpreadsheetCandidate = z.infer<typeof spreadsheetCandidateSchema>;
export const catalogQuerySchema = z.strictObject({
  query: z.string().max(200).default(''),
  cursor: z.string().min(1).max(8192).optional(),
});
export const catalogPageSchema = z.strictObject({
  items: z.array(spreadsheetCandidateSchema),
  nextCursor: idSchema.nullable(),
  incompleteSearch: z.boolean(),
});
export const sourcePreviewRequestSchema = z.strictObject({ spreadsheetId: spreadsheetIdSchema });
export const catalogPreviewSchema = z.strictObject({
  previewId: idSchema,
  source: z.strictObject({
    spreadsheetId: spreadsheetIdSchema,
    title: z.string(),
    sheetId: z.number().int().nonnegative(),
    sheetTitle: z.string(),
  }),
  questions: z.array(questionSchema).min(1),
  fingerprint: z.string().min(1),
  expiresAt: z.number().int().safe(),
});
export type CatalogPreview = z.infer<typeof catalogPreviewSchema>;
export const createCatalogActivitySchema = z.strictObject({
  requestId: idSchema,
  previewId: idSchema,
  groupCount: groupCountSchema,
});
export const catalogCreatedSchema = sourcePreviewSchema.extend({ studentUrl: z.url() });
