import { z } from 'zod';
import { idSchema, phaseSchema, revisionSchema } from './common.js';
import { sourcePreviewSchema, questionSchema } from './source.js';
import { submissionSchema } from './activity.js';
import { writeStatusSchema, writebackSchema } from './writeback.js';
const publicGroup = z.strictObject({
  id: idSchema,
  ordinal: z.number().int().positive(),
  name: z.string(),
});
const result = z.strictObject({
  questionId: z.string(),
  displayNumber: z.string(),
  winnerGroup: publicGroup.nullable(),
  answers: z.record(z.string(), z.string()),
});
export const historySnapshotSchema = z.strictObject({
  activityId: idSchema,
  bootId: idSchema,
  revision: revisionSchema,
  phase: phaseSchema,
  questions: z.array(
    questionSchema.pick({ id: true, displayNumber: true, kind: true }).extend({
      items: z.array(z.strictObject({ id: z.string(), label: z.string(), prompt: z.string() })),
    }),
  ),
  groups: z.array(publicGroup.extend({ occupied: z.boolean() })),
  self: z.strictObject({
    groupId: idSchema.nullable(),
    receipts: z.array(
      z.strictObject({ submissionId: idSchema, questionId: z.string(), accepted: z.literal(true) }),
    ),
  }),
  results: z.array(result).optional(),
  submissions: z.array(submissionSchema).optional(),
  tentativeResults: z.array(result).optional(),
  sourceReady: z.boolean().optional(),
  writebacks: z.array(writebackSchema).optional(),
  authGeneration: z.number().int().nonnegative().optional(),
});
export const historySummarySchema = z.strictObject({
  id: idSchema,
  createdAt: z.number().int().safe(),
  phase: phaseSchema,
  spreadsheetTitle: z.string(),
  sheetTitle: z.string(),
  groupCount: z.number().int().positive(),
  writebackSummary: writeStatusSchema,
});
export const historyPageSchema = z.strictObject({
  items: z.array(historySummarySchema),
  nextCursor: idSchema.nullable(),
});
export const historyDetailSchema = sourcePreviewSchema.extend({
  createdAt: z.number().int().safe(),
  startedAt: z.number().int().nullable(),
  endedAt: z.number().int().nullable(),
  spreadsheetTitle: z.string(),
  sheetTitle: z.string(),
  snapshot: historySnapshotSchema,
});
export type HistoryDetail = z.infer<typeof historyDetailSchema>;
