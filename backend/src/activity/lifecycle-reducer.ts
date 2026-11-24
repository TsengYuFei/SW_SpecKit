import { commandSchemas, type CommandName } from '@classroom/shared/schemas/activity';
import { projectActivity, selectResults } from '@classroom/shared/projections/activity';
import type { ActivityStore } from './store.js';
import type { BrowserSession } from '../security/sessions.js';
import { AppError } from '../security/safe-errors.js';
import { joinGroup, renameGroup } from './group-reducer.js';
import { submitAnswer } from './submission-reducer.js';

export function executeCommand(
  store: ActivityStore,
  session: BrowserSession,
  event: string,
  input: unknown,
): unknown {
  if (!Object.hasOwn(commandSchemas, event)) throw new AppError('INVALID_INPUT');
  const name = event as CommandName;
  const payload = commandSchemas[name].parse(input);
  const activity = store.requireActivity(payload.activityId);
  if (name === 'activity:subscribe') return projectActivity(activity, session);
  const teacherOnly = name === 'activity:start' || name === 'activity:end';
  if (session.role !== (teacherOnly ? 'teacher' : 'student')) throw new AppError('FORBIDDEN');
  return store.command(activity, session.sessionId, name, payload.requestId, payload, () => {
    switch (name) {
      case 'group:join':
        return joinGroup(activity, session, commandSchemas[name].parse(input).groupId);
      case 'group:rename':
        return renameGroup(activity, session, commandSchemas[name].parse(input).name);
      case 'answer:submit': {
        const p = commandSchemas[name].parse(input);
        return submitAnswer(activity, session, p.requestId, p.questionId, p.answers);
      }
      case 'activity:start':
        if (
          activity.phase !== 'waiting' ||
          activity.source?.loadState !== 'ready' ||
          !activity.source.confirmed ||
          !activity.questions.length
        )
          throw new AppError('INVALID_PHASE');
        activity.phase = 'active';
        activity.revision++;
        return null;
      case 'activity:end':
        if (activity.phase !== 'active') throw new AppError('INVALID_PHASE');
        activity.phase = 'ended';
        activity.finalResults = selectResults(activity);
        activity.revision++;
        return null;
    }
  });
}
