import type { Server, Socket } from 'socket.io';
import { commandSchemas } from '@classroom/shared/schemas/activity';
import { projectActivity } from '@classroom/shared/projections/activity';
import { success } from '@classroom/shared/events/envelope';
import type { ActivityStore } from '../activity/store.js';
import type { BrowserSession, Sessions } from '../security/sessions.js';
import type { Role } from '@classroom/shared/schemas/common';
import { executeCommand } from '../activity/lifecycle-reducer.js';
import { consumeMutation } from '../security/guards.js';
import { AppError, safeError } from '../security/safe-errors.js';
import type { TeacherAuthorization } from '../security/guards.js';
import { idSchema } from '@classroom/shared/schemas/common';

interface Subscriber {
  session: BrowserSession;
  activityId: string;
  authorizeTeacher?: TeacherAuthorization;
  authGeneration?: number;
}
const connections = new WeakMap<ActivityStore, Map<Socket, { role: Role; sessionId: string }>>();
export function invalidateTeacherSubscriptions(
  store: ActivityStore,
  sessionId: string,
  authGeneration: number,
) {
  for (const [socket, connection] of connections.get(store) ?? [])
    if (connection.role === 'teacher' && connection.sessionId === sessionId) {
      socket.emit('teacher:authorization-changed', { authGeneration });
      socket.disconnect(true);
    }
}

const subscribers = new WeakMap<ActivityStore, Map<Socket, Subscriber>>();
export function publishActivity(store: ActivityStore, previousPhase?: string) {
  const activity = store.activity;
  if (!activity) return;
  for (const [socket, subscriber] of subscribers.get(store) ?? []) {
    if (subscriber.activityId !== activity.id || !socket.connected) continue;
    if (subscriber.session.role === 'teacher' && subscriber.authorizeTeacher) {
      try {
        const auth = subscriber.authorizeTeacher(subscriber.session, activity.id);
        if (auth.authGeneration !== subscriber.authGeneration)
          throw new AppError('GOOGLE_AUTH_REQUIRED');
      } catch {
        subscribers.get(store)?.delete(socket);
        socket.emit('teacher:authorization-changed', {});
        socket.disconnect(true);
        continue;
      }
    }
    const snapshot = projectActivity(activity, subscriber.session);
    if (subscriber.session.role === 'teacher' && subscriber.authGeneration !== undefined)
      Object.assign(snapshot, { authGeneration: subscriber.authGeneration });
    socket.emit('activity:snapshot', snapshot);
    if (previousPhase && previousPhase !== activity.phase)
      socket.emit('activity:phase', {
        activityId: activity.id,
        revision: activity.revision,
        phase: activity.phase,
      });
    if (subscriber.session.role === 'teacher') {
      socket.emit('teacher:progress', {
        activityId: activity.id,
        revision: activity.revision,
        submissions: snapshot.submissions,
        tentativeResults: snapshot.tentativeResults,
      });
      socket.emit('writeback:status', {
        activityId: activity.id,
        revision: activity.revision,
        operations: snapshot.writebacks,
      });
    }
    if (activity.phase === 'ended')
      socket.emit('results:published', {
        activityId: activity.id,
        revision: activity.revision,
        results: snapshot.results,
      });
  }
}
export function attachActivityHandlers(
  io: Server,
  store: ActivityStore,
  sessions: Sessions,
  role: Role,
  authorizeTeacher?: TeacherAuthorization,
) {
  let subscriptions = subscribers.get(store);
  if (!subscriptions) {
    subscriptions = new Map();
    subscribers.set(store, subscriptions);
  }
  const subscriptionsForStore = subscriptions;
  let connectionMap = connections.get(store);
  if (!connectionMap) {
    connectionMap = new Map();
    connections.set(store, connectionMap);
  }
  const activeConnections = connectionMap;
  io.on('connection', (socket) => {
    const connectedSession = sessions.find(socket.request.headers.cookie, role);
    if (connectedSession)
      activeConnections.set(socket, { role, sessionId: connectedSession.sessionId });
    socket.on('disconnect', () => {
      subscriptionsForStore.delete(socket);
      activeConnections.delete(socket);
    });
    for (const event of Object.keys(commandSchemas))
      socket.on(event, (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        let visibleRevision = 0;
        try {
          const session = sessions.find(socket.request.headers.cookie, role);
          if (!session) throw new AppError('UNAUTHORIZED');
          const auth =
            role === 'teacher' && authorizeTeacher
              ? authorizeTeacher(
                  session,
                  idSchema.parse(
                    typeof input === 'object' && input !== null && 'activityId' in input
                      ? input.activityId
                      : undefined,
                  ),
                )
              : undefined;
          // Subscriptions are rate limited too, preventing unbounded snapshot traffic.
          consumeMutation(session);
          if (
            typeof input === 'object' &&
            input !== null &&
            'activityId' in input &&
            input.activityId === store.activity?.id
          )
            visibleRevision = store.activity?.revision ?? 0;
          const phase = store.activity?.phase;
          const revision = store.activity?.revision;
          const data = executeCommand(store, session, event, input);
          const activity = store.activity!;
          if (event === 'activity:subscribe')
            subscriptionsForStore.set(socket, {
              session,
              activityId: activity.id,
              authorizeTeacher,
              authGeneration: auth?.authGeneration,
            });
          if (event === 'activity:subscribe' && auth && data && typeof data === 'object')
            Object.assign(data, { authGeneration: auth.authGeneration });
          ack(success(data, activity.revision));
          if (activity.revision !== revision) publishActivity(store, phase);
          if (event === 'answer:submit') {
            for (const [peer, subscriber] of subscriptionsForStore)
              if (
                subscriber.activityId === activity.id &&
                subscriber.session.sessionId === session.sessionId
              )
                peer.emit('self:receipt', {
                  activityId: activity.id,
                  revision: activity.revision,
                  receipt: data,
                });
          }
        } catch (error) {
          ack({ ok: false, error: safeError(error), revision: visibleRevision });
        }
      });
  });
}
