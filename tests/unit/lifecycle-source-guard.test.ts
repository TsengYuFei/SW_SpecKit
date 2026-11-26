import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { classroom } from '../helpers/activity.js';
import { createStore } from '../../backend/src/activity/store.js';

// Retain the v1 pure-reducer boundary; production v2 creates only confirmed catalog sources.
// This is not evidence of durable startup recovery, which has its own actual-process tests.
it('blocks the standalone reducer while source is unconfirmed or loading and rejects unavailable activities', () => {
  const c = classroom();
  const payload = { activityId: c.activity.id, requestId: randomUUID() };
  c.activity.source!.confirmed = false;
  expect(() => executeCommand(c.store, c.teacher, 'activity:start', payload)).toThrow();
  c.activity.source!.confirmed = true;
  c.activity.source!.loadState = 'loading';
  expect(() =>
    executeCommand(c.store, c.teacher, 'activity:start', { ...payload, requestId: randomUUID() }),
  ).toThrow();
  c.activity.phase = 'ended';
  c.store.createActivity(2);
  expect(() =>
    executeCommand(c.store, c.a, 'group:join', {
      ...payload,
      groupId: c.groups[0]!.id,
      name: '測試組',
    }),
  ).toThrow('不可用');
  const freshStandaloneStore = createStore(10);
  expect(freshStandaloneStore.bootId).not.toBe(c.store.bootId);
  expect(() => executeCommand(freshStandaloneStore, c.a, 'activity:subscribe', payload)).toThrow(
    '不可用',
  );
});
