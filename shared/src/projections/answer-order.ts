import { parseAnswerOrderInput, type AnswerOrderInput } from '../schemas/result-export.js';
import { fullGroupName } from '../formatters/group-name.js';

export interface OrderedAnswer {
  submissionId: string;
  questionId: string;
  groupId: string;
  fullGroupName: string;
  globalSequence: number;
  questionRank: number;
  items: { itemId: string; label: string; prompt: string; answer: string }[];
}
export interface QuestionOrder {
  questionId: string;
  displayNumber: string;
  kind: 'single' | 'group';
  items: AnswerOrderInput['questions'][number]['items'];
  entries: OrderedAnswer[];
  unansweredGroups: { groupId: string; ordinal: number; fullGroupName: string }[];
}
export interface AnswerOrderView {
  all: OrderedAnswer[];
  questions: QuestionOrder[];
}
export class AnswerOrderError extends Error {
  constructor() {
    super('作答紀錄無法完整顯示');
    this.name = 'AnswerOrderError';
  }
}
function unique(values: (string | number)[]) {
  return new Set(values).size === values.length;
}

/** Derive one common order without changing receipt sequences, inputs or frozen winners. */
export function deriveAnswerOrder(value: unknown): AnswerOrderView {
  let input: AnswerOrderInput;
  try {
    input = parseAnswerOrderInput(value);
  } catch {
    throw new AnswerOrderError();
  }
  const { groups, questions, submissions } = input;
  if (
    !unique(groups.map((g) => g.id)) ||
    !unique(groups.map((g) => g.ordinal)) ||
    !unique(questions.map((q) => q.id)) ||
    !unique(submissions.map((s) => s.id)) ||
    questions.some(
      (q) => !unique(q.items.map((i) => i.id)) || (q.kind === 'single' && q.items.length !== 1),
    )
  )
    throw new AnswerOrderError();
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const ordered: QuestionOrder[] = questions.map((q) => ({
    questionId: q.id,
    displayNumber: q.displayNumber,
    kind: q.kind,
    items: q.items,
    entries: [],
    unansweredGroups: [],
  }));
  const questionById = new Map(ordered.map((q) => [q.questionId, q]));
  const pairs = new Set<string>();
  const all: OrderedAnswer[] = [];
  const sorted = [...submissions].sort((a, b) => a.sequence - b.sequence);
  for (const [index, submission] of sorted.entries()) {
    const group = groupById.get(submission.groupId);
    const question = questionById.get(submission.questionId);
    const pair = JSON.stringify([submission.groupId, submission.questionId]);
    if (
      !group?.occupied ||
      !question ||
      pairs.has(pair) ||
      submission.sequence !== index + 1 ||
      Object.keys(submission.answers).length !== question.items.length ||
      question.items.some((item) => !Object.hasOwn(submission.answers, item.id))
    )
      throw new AnswerOrderError();
    pairs.add(pair);
    const entry: OrderedAnswer = {
      submissionId: submission.id,
      groupId: group.id,
      questionId: question.questionId,
      fullGroupName: fullGroupName(group),
      globalSequence: submission.sequence,
      questionRank: question.entries.length + 1,
      items: question.items.map((item) => ({
        itemId: item.id,
        label: item.label,
        prompt: item.prompt,
        answer: submission.answers[item.id]!,
      })),
    };
    question.entries.push(entry);
    all.push(entry);
  }
  const groupsByOrdinal = [...groups].sort((a, b) => a.ordinal - b.ordinal);
  for (const question of ordered) {
    const answered = new Set(question.entries.map((entry) => entry.groupId));
    question.unansweredGroups = groupsByOrdinal
      .filter((g) => !answered.has(g.id))
      .map((g) => ({ groupId: g.id, ordinal: g.ordinal, fullGroupName: fullGroupName(g) }));
  }
  return { all, questions: ordered };
}
