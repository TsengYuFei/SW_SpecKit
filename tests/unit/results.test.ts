import { expect, it } from 'vitest';
import { publishedResults } from '../../backend/src/activity/results.js';
import { writebackFixture } from '../helpers/writeback.js';

it('publishes one winner per complete question, and represents unanswered questions explicitly', () => {
  const c = writebackFixture();
  const results = publishedResults(c.activity);
  expect(results).toHaveLength(2);
  expect(results[0]!.winnerGroup?.id).toBe(c.groups[0]!.id);
  expect(Object.keys(results[0]!.answers)).toHaveLength(2);
  expect(results[1]).toMatchObject({ winnerGroup: null, answers: {} });
  results[0]!.answers[c.question.items[0]!.id] = 'mutated by caller';
  c.groups[0]!.name = 'later name';
  expect(publishedResults(c.activity)[0]!.answers[c.question.items[0]!.id]).toBe('=SUM(A1)');
  expect(publishedResults(c.activity)[0]!.winnerGroup?.name).toBe('測試組');
  c.activity.phase = 'active';
  expect(() => publishedResults(c.activity)).toThrow();
});
