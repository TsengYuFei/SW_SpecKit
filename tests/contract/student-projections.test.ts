import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { catalogClassroom } from '../helpers/activity.js';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});
it('withholds every question identifier and source from waiting students and restores allowed content after start', async () => {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const run = (session: typeof c.a, event: string, extra = {}) =>
    executeCommand(c.store, session, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    }) as Record<string, unknown>;
  const waiting = run(c.a, 'activity:subscribe');
  expect(waiting.questions).toEqual([]);
  for (const key of ['source', 'submissions', 'tentativeResults', 'writebacks', 'results'])
    expect(waiting).not.toHaveProperty(key);
  for (const question of c.activity.questions)
    expect(JSON.stringify(waiting)).not.toContain(question.id);
  expect((run(c.teacher, 'activity:subscribe').questions as unknown[]).length).toBeGreaterThan(0);
  run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '咕咕嘎嘎' });
  run(c.teacher, 'activity:start');
  expect((run(c.a, 'activity:subscribe').questions as unknown[]).length).toBe(
    c.activity.questions.length,
  );
});
it('requires an atomic valid name, rejects rename, and never occupies a group on invalid input', async () => {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const run = (extra: object, event = 'group:join') =>
    executeCommand(c.store, c.a, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      groupId: c.groups[0]!.id,
      ...extra,
    });
  expect(() => run({})).toThrow();
  expect(() => run({ name: '   ' })).toThrow();
  expect(() => run({ name: '長'.repeat(41) })).toThrow();
  expect(() => run({ name: '合法名字', owner: 'forged-owner' })).toThrow();
  // Astral characters occupy two UTF-16 code units each, as required by the shared schema.
  expect(() => run({ name: '😀'.repeat(20) + '甲' })).toThrow();
  expect(c.server.persistence.activities.groups(c.activity.id)[0]!.participantId).toBeNull();
  expect(run({ name: '  咕咕嘎嘎  ' })).toMatchObject({
    name: '咕咕嘎嘎',
    fullName: '第1組-咕咕嘎嘎',
  });
  expect(() =>
    executeCommand(c.store, c.a, 'group:rename', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      name: '換名',
    }),
  ).toThrowError(expect.objectContaining({ code: 'NAME_LOCKED' }));
  expect(() =>
    executeCommand(c.store, c.teacher, 'group:rename', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      name: '老師也不能換名',
    }),
  ).toThrowError(expect.objectContaining({ code: 'NAME_LOCKED' }));
});
