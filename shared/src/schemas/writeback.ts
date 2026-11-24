import { z } from 'zod';
import { idSchema, errorCodeSchema } from './common.js';

export const writeStatusSchema = z.enum([
  'idle',
  'writing',
  'pending',
  'verified',
  'conflict',
  'failed',
]);
export type WriteStatus = z.infer<typeof writeStatusSchema>;
export const questionWritebackSchema = z.strictObject({
  questionId: z.string(),
  status: writeStatusSchema,
  expectedAnswers: z.record(z.string(), z.string()),
  itemStatuses: z.record(z.string(), writeStatusSchema),
  error: z
    .strictObject({ code: errorCodeSchema, message: z.string(), retryable: z.boolean() })
    .optional(),
});
export type QuestionWriteback = z.infer<typeof questionWritebackSchema>;
export const writebackSchema = z.strictObject({
  operationId: idSchema,
  activityId: idSchema,
  status: writeStatusSchema,
  questions: z.array(questionWritebackSchema),
});
export type Writeback = z.infer<typeof writebackSchema>;
