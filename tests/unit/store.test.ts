import { expect, it } from 'vitest';
import { createStore } from '../../backend/src/activity/store.js';

it('uses a new boot identity and rejects stale activities', () => {
  const first = createStore(10);
  const activity = first.createActivity(2);
  expect(activity.phase).toBe('waiting');
  expect(activity.groups.size).toBe(2);
  const second = createStore(10);
  expect(second.bootId).not.toBe(first.bootId);
  expect(() => second.requireActivity(activity.id)).toThrow();
});

it('validates resource bounds and protects active activity', () => {
  const store = createStore(2);
  expect(() => store.createActivity(0)).toThrow();
  expect(() => store.createActivity(3)).toThrow();
  store.createActivity(2);
  expect(() => store.createActivity(1)).toThrow();
});

it('replays a receipt and rejects a changed payload', () => {
  const store = createStore(2);
  const activity = store.createActivity(2);
  let mutations = 0;
  const run = () =>
    store.command(activity, 'session', 'test', 'request', { a: 1 }, () => ++mutations);
  expect(run()).toBe(1);
  expect(run()).toBe(1);
  expect(mutations).toBe(1);
  expect(() => store.command(activity, 'session', 'test', 'request', { a: 2 }, () => 0)).toThrow();
});
