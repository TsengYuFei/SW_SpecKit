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

const subscribers = new WeakMap<
  ActivityStore,
  Map<Socket, { session: BrowserSession; activityId: string }>
>();
export function publishActivity(store: ActivityStore, previousPhase?: string) {
  const activity = store.activity;
  if (!activity) return;
  for (const [socket, subscriber] of subscribers.get(store) ?? []) {
    if (subscriber.activityId !== activity.id || !socket.connected) continue;
    const snapshot = projectActivity(activity, subscriber.session);
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
) {
  let subscriptions = subscribers.get(store);
  if (!subscriptions) {
    subscriptions = new Map();
    subscribers.set(store, subscriptions);
  }
  const subscriptionsForStore = subscriptions;
  io.on('connection', (socket) => {
    socket.on('disconnect', () => subscriptionsForStore.delete(socket));
    for (const event of Object.keys(commandSchemas))
      socket.on(event, (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        try {
          const session = sessions.find(socket.request.headers.cookie, role);
          if (!session) throw new AppError('UNAUTHORIZED');
          // Subscriptions are rate limited too, preventing unbounded snapshot traffic.
          consumeMutation(session);
          const phase = store.activity?.phase;
          const revision = store.activity?.revision;
          const data = executeCommand(store, session, event, input);
          const activity = store.activity!;
          if (event === 'activity:subscribe')
            subscriptionsForStore.set(socket, { session, activityId: activity.id });
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
          ack({ ok: false, error: safeError(error), revision: store.activity?.revision ?? 0 });
        }
      });
  });
}
