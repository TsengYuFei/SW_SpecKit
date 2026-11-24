import { z } from 'zod';
import { commandSchema, idSchema } from './common.js';
import { ANSWER_LIMIT, GROUP_NAME_LIMIT } from '../limits.js';

export const groupSchema = z.strictObject({
  id: idSchema,
  ordinal: z.number().int().positive().safe(),
  name: z.string().max(GROUP_NAME_LIMIT),
  browserSessionId: z.string().nullable(),
});
export type Group = z.infer<typeof groupSchema>;
export const answersSchema = z.record(
  z.string().min(1),
  z.string().trim().min(1).max(ANSWER_LIMIT),
);
export const submissionSchema = z.strictObject({
  id: idSchema,
  requestId: idSchema,
  questionId: z.string().min(1),
  groupId: idSchema,
  answers: answersSchema,
  receivedAt: z.number().finite(),
  sequence: z.number().int().positive().safe(),
});
export type Submission = z.infer<typeof submissionSchema>;
export interface SelfReceipt {
  submissionId: string;
  questionId: string;
  accepted: true;
}
export const commandSchemas = {
  'activity:subscribe': commandSchema,
  'group:join': commandSchema.extend({ groupId: idSchema }),
  'group:rename': commandSchema.extend({ name: z.string().trim().min(1).max(GROUP_NAME_LIMIT) }),
  'activity:start': commandSchema,
  // Content validation happens inside the deduplicated command, so rejected submissions are cached too.
  'answer:submit': commandSchema.extend({
    questionId: z.string().min(1).max(200),
    answers: z.record(
      z.string(),
      z.string().transform((value) => value.trim()),
    ),
  }),
  'activity:end': commandSchema,
} as const;
export type CommandName = keyof typeof commandSchemas;
