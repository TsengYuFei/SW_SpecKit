import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { projectActivity } from '../../shared/src/projections/activity.js';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { classroom } from '../helpers/activity.js';

it('keeps other answers, progress, sequence, targets and browser identifiers out of student packets', () => {
  const c = classroom();
  const run = (session: typeof c.a, event: string, extra = {}) =>
    executeCommand(c.store, session, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id });
  run(c.teacher, 'activity:start');
  run(c.a, 'answer:submit', {
    questionId: c.question.id,
    answers: Object.fromEntries(c.question.items.map((item) => [item.id, 'PRIVATE ANSWER'])),
  });
  for (const session of [c.a, c.b]) {
    const snapshot = projectActivity(c.activity, session);
    const json = JSON.stringify(snapshot);
    for (const forbidden of [
      'PRIVATE ANSWER',
      'sequence',
      'receivedAt',
      'target',
      'baseline',
      'browserSessionId',
      'spreadsheetId',
      'csrfToken',
      c.a.sessionId,
    ])
      expect(json).not.toContain(forbidden);
    expect(snapshot).not.toHaveProperty('results');
  }
  expect(projectActivity(c.activity, c.teacher)).toHaveProperty('submissions');
  expect(projectActivity(c.activity, { ...c.a })).toEqual(projectActivity(c.activity, c.a));
  run(c.teacher, 'activity:end');
  const ended = projectActivity(c.activity, c.b);
  expect(ended.results?.[0]?.winnerGroup?.id).toBe(c.groups[0]!.id);
  expect(JSON.stringify(ended.results)).toContain('PRIVATE ANSWER');
});
