import { commandSchemas, type CommandName } from '@classroom/shared/schemas/activity';
import { projectActivity, receiptFor } from '@classroom/shared/projections/activity';
import { fullGroupName } from '@classroom/shared/formatters/group-name';
import type { ActivityStore } from './store.js';
import type { BrowserSession } from '../security/sessions.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import { readPersistentActivity } from './persistent-store.js';
import { AppError } from '../security/safe-errors.js';

export function createPersistentCommands(
  store: ActivityStore,
  persistence: RuntimePersistence,
  authorize: (session: BrowserSession, id: string) => { accountId: string },
  wake: () => void = () => {},
) {
  function refresh(id: string) {
    const prior = store.activity;
    const activity = readPersistentActivity(persistence, store, id);
    if (prior?.id === id) {
      Object.assign(prior, activity);
      store.installActivity(prior);
      return prior;
    }
    store.installActivity(activity);
    return activity;
  }
  return (session: BrowserSession, event: string, input: unknown): unknown => {
    if (!Object.hasOwn(commandSchemas, event)) throw new AppError('INVALID_INPUT');
    const name = event as CommandName;
    const payload = commandSchemas[name].parse(input);
    if (persistence.activities.current()?.id !== payload.activityId)
      throw new AppError('ACTIVITY_UNAVAILABLE');
    const teacherOnly = name === 'activity:start' || name === 'activity:end';
    const owner = session.role === 'teacher' ? authorize(session, payload.activityId) : undefined;
    if (name === 'activity:subscribe') return projectActivity(refresh(payload.activityId), session);
    if (name === 'group:rename') throw new AppError('NAME_LOCKED');
    if (session.role !== (teacherOnly ? 'teacher' : 'student')) throw new AppError('FORBIDDEN');
    const outcome = persistence.commands.execute(
      {
        activityId: payload.activityId,
        actorKey: owner ? `teacher:${owner.accountId}` : `participant:${session.sessionId}`,
        event: name,
        requestId: payload.requestId,
        payload,
      },
      () => {
        if (name === 'group:join') {
          const body = commandSchemas[name].parse(input);
          const group = persistence.participation.join(
            payload.activityId,
            body.groupId,
            session.sessionId,
            body.name,
          );
          return {
            groupId: group.id,
            ordinal: group.ordinal,
            name: group.name,
            fullName: fullGroupName(group),
          };
        }
        if (name === 'answer:submit') {
          const body = commandSchemas[name].parse(input);
          return receiptFor(
            persistence.participation.submit(
              payload.activityId,
              session.sessionId,
              body.questionId,
              payload.requestId,
              body.answers,
            ),
          );
        }
        if (name === 'activity:start') {
          persistence.activities.start(payload.activityId, owner!.accountId);
          return null;
        }
        if (name === 'activity:end') {
          const activity = persistence.activities.getOwned(payload.activityId, owner!.accountId);
          if (activity.phase !== 'active') throw new AppError('INVALID_PHASE');
          persistence.connection.database
            .prepare(
              "UPDATE activities SET phase='ended',ended_at=?,revision=revision+1 WHERE id=?",
            )
            .run(Date.now(), activity.id);
          const job = persistence.writebacks.createForEnded(activity.id);
          return { phase: 'ended', jobId: String(job.id), jobQueued: job.status !== 'verified' };
        }
        throw new AppError('INVALID_INPUT');
      },
    );
    refresh(payload.activityId);
    if (name === 'activity:end') wake();
    if (name === 'group:join') session.activityId = payload.activityId;
    return outcome;
  };
}
