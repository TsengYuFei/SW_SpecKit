import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { classroom } from '../helpers/activity.js';
import { createStore } from '../../backend/src/activity/store.js';

it('atomically binds one browser to one group and preserves binding after reconnect', () => {
  const c = classroom();
  const join = (session: typeof c.a, groupId: string) =>
    executeCommand(c.store, session, 'group:join', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      groupId,
    });
  join(c.a, c.groups[0]!.id);
  expect(() => join(c.b, c.groups[0]!.id)).toThrow('已被其他');
  expect(() => join(c.a, c.groups[1]!.id)).toThrow('已加入另一');
  expect(join(c.a, c.groups[0]!.id)).toEqual({ groupId: c.groups[0]!.id });
  join(c.b, c.groups[1]!.id);
  expect(c.activity.groups.size).toBe(2);
});

it('orders complete answers by server sequence, caches rejection and retries after end', () => {
  const c = classroom();
  const run = (session: typeof c.a, event: string, extra = {}, requestId = randomUUID()) =>
    executeCommand(c.store, session, event, { activityId: c.activity.id, requestId, ...extra });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id });
  run(c.b, 'group:join', { groupId: c.groups[1]!.id });
  expect(() => run(c.a, 'answer:submit', { questionId: c.question.id, answers: {} })).toThrow();
  run(c.teacher, 'activity:start');
  const badId = randomUUID();
  const bad = { questionId: c.question.id, answers: {} };
  expect(() => run(c.a, 'answer:submit', bad, badId)).toThrow('全部小題');
  const answers = Object.fromEntries(c.question.items.map((item) => [item.id, ' 第一組答案 ']));
  expect(() => run(c.a, 'answer:submit', { ...bad, answers }, badId)).toThrow('不同內容');
  const payload = { questionId: c.question.id, answers };
  const id = randomUUID();
  const receipt = run(c.a, 'answer:submit', payload, id);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1);
  run(c.b, 'answer:submit', {
    questionId: c.question.id,
    answers: Object.fromEntries(c.question.items.map((item) => [item.id, '第二組答案'])),
  });
  clock.mockRestore();
  expect([...c.activity.submissions.values()].map((s) => s.sequence)).toEqual([1, 2]);
  expect(() => run(c.a, 'answer:submit', payload)).toThrow('第一次');
  run(c.teacher, 'activity:end');
  expect(run(c.a, 'answer:submit', payload, id)).toEqual(receipt);
  expect(() => run(c.b, 'answer:submit', payload)).toThrow('階段');
  expect(c.activity.submissions.size).toBe(2);
});

it('blocks start while source is unconfirmed or loading; rejects old activity after replacement', () => {
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
    executeCommand(c.store, c.a, 'group:join', { ...payload, groupId: c.groups[0]!.id }),
  ).toThrow('不可用');
  const restarted = createStore(10);
  expect(restarted.bootId).not.toBe(c.store.bootId);
  expect(() => executeCommand(restarted, c.a, 'activity:subscribe', payload)).toThrow('不可用');
});

it('rejects unknown items, blank and oversized answers without consuming a sequence', () => {
  const c = classroom();
  const run = (event: string, extra = {}) =>
    executeCommand(c.store, event.startsWith('activity:') ? c.teacher : c.a, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run('group:join', { groupId: c.groups[0]!.id });
  run('activity:start');
  const answers = Object.fromEntries(c.question.items.map((i) => [i.id, 'value']));
  for (const invalid of [
    { ...answers, bogus: 'bad' },
    { ...answers, [c.question.items[0]!.id]: '  ' },
    { ...answers, [c.question.items[0]!.id]: 'x'.repeat(2001) },
  ]) {
    expect(() => run('answer:submit', { questionId: c.question.id, answers: invalid })).toThrow();
  }
  expect(c.activity.nextSequence).toBe(1);
  expect(c.activity.submissions.size).toBe(0);
});

it('end and submit share the same synchronous admission order', () => {
  for (const endFirst of [true, false]) {
    const c = classroom();
    const run = (session: typeof c.a, event: string, extra = {}) =>
      executeCommand(c.store, session, event, {
        activityId: c.activity.id,
        requestId: randomUUID(),
        ...extra,
      });
    run(c.a, 'group:join', { groupId: c.groups[0]!.id });
    run(c.teacher, 'activity:start');
    const submit = () =>
      run(c.a, 'answer:submit', {
        questionId: c.question.id,
        answers: Object.fromEntries(c.question.items.map((i) => [i.id, 'answer'])),
      });
    if (endFirst) {
      run(c.teacher, 'activity:end');
      expect(submit).toThrow('階段');
    } else {
      submit();
      run(c.teacher, 'activity:end');
    }
    expect(c.activity.submissions.size).toBe(endFirst ? 0 : 1);
  }
});
