import { randomUUID } from 'node:crypto';
import { answersSchema } from '@classroom/shared/schemas/activity';
import { receiptFor } from '@classroom/shared/projections/activity';
import type { Activity } from './store.js';
import type { BrowserSession } from '../security/sessions.js';
import { AppError } from '../security/safe-errors.js';
import { ownGroup } from './group-reducer.js';

export function submitAnswer(
  activity: Activity,
  session: BrowserSession,
  requestId: string,
  questionId: string,
  input: Record<string, string>,
) {
  if (activity.phase !== 'active') throw new AppError('INVALID_PHASE');
  const group = ownGroup(activity, session);
  if (!group || session.activityId !== activity.id) throw new AppError('FORBIDDEN');
  const question = activity.questions.find((q) => q.id === questionId);
  if (!question) throw new AppError('INVALID_INPUT');
  if (
    Object.keys(input).length !== question.items.length ||
    question.items.some((i) => !Object.hasOwn(input, i.id) || !input[i.id]?.trim())
  )
    throw new AppError('INCOMPLETE_ANSWERS');
  const answers = answersSchema.parse(input);
  const key = JSON.stringify([group.id, questionId]);
  if (activity.submissions.has(key)) throw new AppError('ALREADY_SUBMITTED');
  const submission = {
    id: randomUUID(),
    requestId,
    questionId,
    groupId: group.id,
    answers,
    receivedAt: Date.now(),
    sequence: activity.nextSequence++,
  };
  activity.submissions.set(key, submission);
  activity.revision++;
  return receiptFor(submission);
}
