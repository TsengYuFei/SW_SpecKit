import { z } from 'zod';
import { groupNameSchema } from './activity.js';
import { ANSWER_LIMIT } from '../limits.js';

const item = z.strictObject({
  id: z.string().min(1),
  label: z.string(),
  prompt: z.string().min(1),
});
export const answerOrderInputSchema = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        displayNumber: z.string().min(1),
        kind: z.enum(['single', 'group']),
        items: z.array(item).min(1),
      }),
    )
    .min(1),
  groups: z
    .array(
      z
        .strictObject({
          id: z.uuid(),
          ordinal: z.number().int().positive().safe(),
          name: z.string(),
          occupied: z.boolean(),
        })
        .refine((group) => {
          if (!group.occupied) return group.name === '';
          const parsed = groupNameSchema.safeParse(group.name);
          return parsed.success && parsed.data === group.name;
        }),
    )
    .min(1),
  submissions: z.array(
    z.strictObject({
      id: z.uuid(),
      groupId: z.uuid(),
      questionId: z.string().min(1),
      sequence: z.number().int().positive().safe(),
      // Validate without trimming saved text: export must retain the original accepted value.
      answers: z.record(
        z.string().min(1),
        z
          .string()
          .min(1)
          .max(ANSWER_LIMIT)
          .refine((v) => v.trim().length > 0),
      ),
    }),
  ),
});
export type AnswerOrderInput = z.infer<typeof answerOrderInputSchema>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function pick(value: unknown, keys: string[]): unknown {
  return record(value) ? Object.fromEntries(keys.map((key) => [key, value[key]])) : value;
}
function nodes(value: unknown, keys: string[]): unknown {
  return Array.isArray(value) ? value.map((node) => pick(node, keys)) : value;
}

/** Pick teacher metadata explicitly; a missing submissions array must never become an empty one. */
export function parseAnswerOrderInput(value: unknown): AnswerOrderInput {
  if (!record(value)) return answerOrderInputSchema.parse(value);
  return answerOrderInputSchema.parse({
    questions: Array.isArray(value.questions)
      ? value.questions.map((q: unknown) =>
          record(q)
            ? {
                id: q.id,
                displayNumber: q.displayNumber,
                kind: q.kind,
                items: nodes(q.items, ['id', 'label', 'prompt']),
              }
            : q,
        )
      : value.questions,
    groups: nodes(value.groups, ['id', 'ordinal', 'name', 'occupied']),
    submissions: nodes(value.submissions, ['id', 'groupId', 'questionId', 'sequence', 'answers']),
  });
}
