import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { catalogClassroom } from '../helpers/activity.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const stop of stops.splice(0)) await stop();
});
async function classroom() {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  return c;
}

it('atomically binds one browser to one group and preserves binding after reconnect', async () => {
  const c = await classroom();
  const join = (session: typeof c.a, groupId: string) =>
    executeCommand(c.store, session, 'group:join', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      groupId,
      name: '測試組',
    });
  join(c.a, c.groups[0]!.id);
  expect(() => join(c.b, c.groups[0]!.id)).toThrow('已被其他');
  expect(() => join(c.a, c.groups[1]!.id)).toThrow('已加入另一');
  expect(join(c.a, c.groups[0]!.id)).toMatchObject({ groupId: c.groups[0]!.id, name: '測試組' });
  join(c.b, c.groups[1]!.id);
  expect(c.activity.groups.size).toBe(2);
});

it('orders complete answers by server sequence, caches rejection and retries after end', async () => {
  const c = await classroom();
  const run = (session: typeof c.a, event: string, extra = {}, requestId = randomUUID()) =>
    executeCommand(c.store, session, event, { activityId: c.activity.id, requestId, ...extra });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' });
  run(c.b, 'group:join', { groupId: c.groups[1]!.id, name: '測試組' });
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

it('rejects unknown items, blank and oversized answers without consuming a sequence', async () => {
  const c = await classroom();
  const run = (event: string, extra = {}) =>
    executeCommand(c.store, event.startsWith('activity:') ? c.teacher : c.a, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run('group:join', { groupId: c.groups[0]!.id, name: '測試組' });
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

it('end and submit share the same synchronous admission order', async () => {
  for (const endFirst of [true, false]) {
    const c = await classroom();
    const run = (session: typeof c.a, event: string, extra = {}) =>
      executeCommand(c.store, session, event, {
        activityId: c.activity.id,
        requestId: randomUUID(),
        ...extra,
      });
    run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' });
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
