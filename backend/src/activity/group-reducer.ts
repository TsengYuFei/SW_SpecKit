import type { Activity } from './store.js';
import type { BrowserSession } from '../security/sessions.js';
import { AppError } from '../security/safe-errors.js';
import { groupNameSchema } from '@classroom/shared/schemas/activity';
import { fullGroupName } from '@classroom/shared/formatters/group-name';

export function ownGroup(activity: Activity, session: BrowserSession) {
  return [...activity.groups.values()].find((g) => g.browserSessionId === session.sessionId);
}
export function joinGroup(
  activity: Activity,
  session: BrowserSession,
  groupId: string,
  inputName: string,
) {
  const name = groupNameSchema.parse(inputName);
  if (activity.phase === 'ended') throw new AppError('INVALID_PHASE');
  const current = ownGroup(activity, session);
  if (current && current.id !== groupId) throw new AppError('ALREADY_JOINED');
  const group = activity.groups.get(groupId);
  if (!group) throw new AppError('INVALID_INPUT');
  if (group.browserSessionId && group.browserSessionId !== session.sessionId)
    throw new AppError('GROUP_OCCUPIED');
  if (!current) {
    group.browserSessionId = session.sessionId;
    group.name = name;
    activity.revision++;
  } else if (group.name !== name) throw new AppError('NAME_LOCKED');
  session.activityId = activity.id;
  return { groupId, ordinal: group.ordinal, name, fullName: fullGroupName(group) };
}
export function renameGroup(): never {
  throw new AppError('NAME_LOCKED');
}
