import type { Group, SelfReceipt, Submission } from '../schemas/activity.js';
import type { Phase, Role } from '../schemas/common.js';
import type { Question } from '../schemas/source.js';
import type { Writeback } from '../schemas/writeback.js';

export interface PublicGroup {
  id: string;
  ordinal: number;
  name: string;
  occupied: boolean;
}
export interface Result {
  questionId: string;
  displayNumber: string;
  winnerGroup: Omit<PublicGroup, 'occupied'> | null;
  answers: Record<string, string>;
}
export interface ActivitySnapshot {
  authGeneration?: number;
  activityId: string;
  bootId: string;
  revision: number;
  phase: Phase;
  questions: {
    id: string;
    displayNumber: string;
    kind: 'single' | 'group';
    items: { id: string; label: string; prompt: string }[];
  }[];
  groups: PublicGroup[];
  self: { groupId: string | null; receipts: SelfReceipt[] };
  results?: Result[];
  submissions?: Submission[];
  tentativeResults?: Result[];
  sourceReady?: boolean;
  writebacks?: Writeback[];
}
interface Projectable {
  id: string;
  bootId: string;
  revision: number;
  phase: Phase;
  questions: Question[];
  groups: Map<string, Group>;
  submissions: Map<string, Submission>;
  source: { confirmed: boolean; loadState: string } | null;
  finalResults?: Result[] | null;
  writebacks?: Map<string, Writeback>;
}
export function selectResults(activity: Projectable): Result[] {
  return activity.questions.map((question) => {
    const first = [...activity.submissions.values()]
      .filter((s) => s.questionId === question.id)
      .sort((a, b) => a.sequence - b.sequence)[0];
    const group = first ? activity.groups.get(first.groupId) : undefined;
    return {
      questionId: question.id,
      displayNumber: question.displayNumber,
      winnerGroup: group ? { id: group.id, ordinal: group.ordinal, name: group.name } : null,
      answers: first ? { ...first.answers } : {},
    };
  });
}
export function projectActivity(
  activity: Projectable,
  session: { role: Role; sessionId: string },
): ActivitySnapshot {
  const group = [...activity.groups.values()].find((g) => g.browserSessionId === session.sessionId);
  const snapshot: ActivitySnapshot = {
    activityId: activity.id,
    bootId: activity.bootId,
    revision: activity.revision,
    phase: activity.phase,
    questions: (session.role === 'student' && activity.phase === 'waiting'
      ? []
      : activity.questions
    ).map((q) => ({
      id: q.id,
      displayNumber: q.displayNumber,
      kind: q.kind,
      items: q.items.map((i) => ({ id: i.id, label: i.label, prompt: i.prompt })),
    })),
    groups: [...activity.groups.values()].map((g) => ({
      id: g.id,
      ordinal: g.ordinal,
      name:
        session.role === 'teacher' || g.id === group?.id || activity.phase === 'ended'
          ? g.name
          : '',
      occupied: g.browserSessionId !== null,
    })),
    self: {
      groupId: group?.id ?? null,
      receipts: [...activity.submissions.values()]
        .filter((s) => s.groupId === group?.id)
        .map(receiptFor),
    },
  };
  if (activity.phase === 'ended' && activity.finalResults)
    snapshot.results = structuredClone(activity.finalResults);
  if (session.role === 'teacher') {
    snapshot.submissions = [...activity.submissions.values()].map((s) => ({
      ...s,
      answers: { ...s.answers },
    }));
    snapshot.tentativeResults = selectResults(activity);
    snapshot.sourceReady = activity.source?.loadState === 'ready' && activity.source.confirmed;
    snapshot.writebacks = [...(activity.writebacks?.values() ?? [])].map((op) =>
      structuredClone(op),
    );
  }
  return snapshot;
}
export function receiptFor(submission: Pick<Submission, 'id' | 'questionId'>): SelfReceipt {
  return { submissionId: submission.id, questionId: submission.questionId, accepted: true };
}
