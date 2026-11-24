import type { Activity } from './store.js';
import type { BrowserSession } from '../security/sessions.js';
import { AppError } from '../security/safe-errors.js';

export function ownGroup(activity: Activity, session: BrowserSession) {
  return [...activity.groups.values()].find((g) => g.browserSessionId === session.sessionId);
}
export function joinGroup(activity: Activity, session: BrowserSession, groupId: string) {
  if (activity.phase === 'ended') throw new AppError('INVALID_PHASE');
  const current = ownGroup(activity, session);
  if (current && current.id !== groupId) throw new AppError('ALREADY_JOINED');
  const group = activity.groups.get(groupId);
  if (!group) throw new AppError('INVALID_INPUT');
  if (group.browserSessionId && group.browserSessionId !== session.sessionId)
    throw new AppError('GROUP_OCCUPIED');
  if (!current) {
    group.browserSessionId = session.sessionId;
    activity.revision++;
  }
  session.activityId = activity.id;
  return { groupId };
}
export function renameGroup(activity: Activity, session: BrowserSession, name: string) {
  if (activity.phase === 'ended') throw new AppError('INVALID_PHASE');
  const group = ownGroup(activity, session);
  if (!group) throw new AppError('FORBIDDEN');
  group.name = name;
  activity.revision++;
  return { groupId: group.id };
}
