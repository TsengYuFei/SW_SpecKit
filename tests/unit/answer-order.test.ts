import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { deriveAnswerOrder, AnswerOrderError } from '../../shared/src/projections/answer-order.js';

function input() {
  const groups = ['甲組', '乙組', ''].map((name, i) => ({
    id: randomUUID(),
    ordinal: i + 1,
    name,
    occupied: i < 2,
  }));
  const questions = [
    {
      id: 'q1',
      displayNumber: '1',
      kind: 'single',
      items: [{ id: 'a', label: '', prompt: '3+4？' }],
    },
    {
      id: 'q2',
      displayNumber: '2',
      kind: 'group',
      items: [
        { id: 'b', label: '（1）', prompt: '化學式？' },
        { id: 'c', label: '（2）', prompt: '沸點？' },
      ],
    },
  ];
  const submissions = [
    {
      id: randomUUID(),
      groupId: groups[0]!.id,
      questionId: 'q2',
      sequence: 1,
      receivedAt: 100,
      answers: { b: 'H₂O', c: '100°C' },
    },
    {
      id: randomUUID(),
      groupId: groups[1]!.id,
      questionId: 'q1',
      sequence: 2,
      receivedAt: 100,
      answers: { a: '7' },
    },
    {
      id: randomUUID(),
      groupId: groups[1]!.id,
      questionId: 'q2',
      sequence: 3,
      receivedAt: 100,
      answers: { b: 'HO₂', c: '90°C' },
    },
    {
      id: randomUUID(),
      groupId: groups[0]!.id,
      questionId: 'q1',
      sequence: 4,
      receivedAt: 0,
      answers: { a: '8' },
    },
  ];
  return { questions, groups, submissions };
}

it('derives distinct dense question ranks from original sequence, preserves full items and never mutates input', () => {
  const value = input();
  value.submissions.reverse();
  const before = structuredClone(value);
  const view = deriveAnswerOrder(value);
  expect(value).toEqual(before);
  expect(view.all.map((a) => [a.globalSequence, a.questionRank])).toEqual([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
  ]);
  expect(view.questions.map((q) => q.entries.map((a) => a.fullGroupName))).toEqual([
    ['第2組-乙組', '第1組-甲組'],
    ['第1組-甲組', '第2組-乙組'],
  ]);
  expect(view.questions[1]!.entries[0]!.items.map((a) => a.answer)).toEqual(['H₂O', '100°C']);
  expect(view.questions.every((q) => q.unansweredGroups[0]!.fullGroupName === '第3組')).toBe(true);
});

it('retains all questions and all configured groups with zero accepted answers', () => {
  const value = input();
  value.submissions = [];
  const view = deriveAnswerOrder(value);
  expect(view.all).toEqual([]);
  expect(view.questions.map((q) => [q.entries.length, q.unansweredGroups.length])).toEqual([
    [0, 3],
    [0, 3],
  ]);
});

it.each([
  'sequence',
  'duplicate-sequence',
  'pair',
  'item',
  'group',
  'question',
  'submission',
  'ordinal',
  'blank',
  'oversized',
  'name',
  'unjoined',
  'single',
  'duplicate-question',
  'duplicate-item',
  'extra-answer',
  'duplicate-group',
])('rejects invalid %s rather than creating a partial order', (fault) => {
  const value = input();
  if (fault === 'sequence') value.submissions[3]!.sequence = 5;
  if (fault === 'duplicate-sequence') value.submissions[3]!.sequence = 3;
  if (fault === 'pair') value.submissions[3]!.groupId = value.groups[1]!.id;
  if (fault === 'item') delete value.submissions[0]!.answers.c;
  if (fault === 'group') value.submissions[0]!.groupId = randomUUID();
  if (fault === 'question') value.submissions[0]!.questionId = 'missing';
  if (fault === 'submission') value.submissions[1]!.id = value.submissions[0]!.id;
  if (fault === 'ordinal') value.groups[1]!.ordinal = 1;
  if (fault === 'blank') value.submissions[1]!.answers.a = '  ';
  if (fault === 'oversized') value.submissions[1]!.answers.a = '長'.repeat(2001);
  if (fault === 'name') value.groups[0]!.name = ' 名稱 ';
  if (fault === 'unjoined') value.groups[0]!.occupied = false;
  if (fault === 'single') value.questions[1]!.kind = 'single';
  if (fault === 'duplicate-question') value.questions[1]!.id = 'q1';
  if (fault === 'duplicate-item') value.questions[1]!.items[1]!.id = 'b';
  if (fault === 'extra-answer') value.submissions[0]!.answers.a = '多餘答案';
  if (fault === 'duplicate-group') value.groups[1]!.id = value.groups[0]!.id;
  expect(() => deriveAnswerOrder(value)).toThrow(AnswerOrderError);
});

it('preserves original answer whitespace and validates names at the UTF-16 boundary', () => {
  const value = input();
  value.groups[0]!.name = '😀'.repeat(20);
  value.submissions[1]!.answers.a = '  =1+1\n';
  expect(deriveAnswerOrder(value).all[1]!.items[0]!.answer).toBe('  =1+1\n');
  value.groups[0]!.name += '甲';
  expect(() => deriveAnswerOrder(value)).toThrow(AnswerOrderError);
});
