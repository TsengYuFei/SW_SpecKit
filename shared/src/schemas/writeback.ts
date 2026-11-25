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
export const writeReasonSchema = z.union([
  errorCodeSchema,
  z.enum(['QUEUED', 'VERIFICATION_PAUSED', 'AUTO_RETRY_EXHAUSTED']),
]);
export const questionWritebackSchema = z.strictObject({
  reasonCode: writeReasonSchema.optional(),
  retryCycle: z.number().int().nonnegative().optional(),
  writeAttemptCount: z.number().int().min(0).max(3).optional(),
  verificationFailureCount: z.number().int().min(0).max(4).optional(),
  nextAttemptAt: z.number().int().nullable().optional(),
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
  reasonCode: writeReasonSchema.optional(),
  operationId: idSchema,
  activityId: idSchema,
  status: writeStatusSchema,
  questions: z.array(questionWritebackSchema),
});
export type Writeback = z.infer<typeof writebackSchema>;
