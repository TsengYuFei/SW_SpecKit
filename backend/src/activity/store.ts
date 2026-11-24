import { randomUUID } from 'node:crypto';
import { groupCountSchema, type Phase } from '@classroom/shared/schemas/common';
import { AppError } from '../security/safe-errors.js';
import type { Question, Source } from '@classroom/shared/schemas/source';

export interface Group {
  id: string;
  ordinal: number;
  name: string;
  browserSessionId: string | null;
}

interface Receipt {
  fingerprint: string;
  result?: unknown;
  error?: AppError;
}
export interface Activity {
  id: string;
  bootId: string;
  phase: Phase;
  revision: number;
  groupCount: number;
  source: Source | null;
  questions: Question[];
  groups: Map<string, Group>;
  submissions: Map<string, unknown>;
  nextSequence: number;
  commandReceipts: Map<string, Receipt>;
  writebackPending: boolean;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function createStore(maxGroups: number) {
  const bootId = randomUUID();
  let activity: Activity | null = null;
  function createActivity(count: number): Activity {
    const groupCount = groupCountSchema.max(maxGroups).parse(count);
    if (activity && (activity.phase !== 'ended' || activity.writebackPending))
      throw new AppError('INVALID_PHASE');
    const groups = new Map<string, Group>();
    for (let ordinal = 1; ordinal <= groupCount; ordinal++) {
      const group = { id: randomUUID(), ordinal, name: '', browserSessionId: null };
      groups.set(group.id, group);
    }
    activity = {
      id: randomUUID(),
      bootId,
      phase: 'waiting',
      revision: 0,
      groupCount,
      source: null,
      questions: [],
      groups,
      submissions: new Map(),
      nextSequence: 1,
      commandReceipts: new Map(),
      writebackPending: false,
    };
    return activity;
  }
  function requireActivity(id: string) {
    if (activity?.id !== id) throw new AppError('ACTIVITY_UNAVAILABLE');
    return activity;
  }
  function command<T>(
    target: Activity,
    sessionId: string,
    event: string,
    requestId: string,
    payload: unknown,
    mutate: () => T,
  ): T {
    requireActivity(target.id);
    const key = JSON.stringify([target.id, sessionId, event, requestId]);
    const fingerprint = JSON.stringify(canonical(payload));
    const prior = target.commandReceipts.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError('REQUEST_CONFLICT');
      if (prior.error) throw prior.error;
      return prior.result as T;
    }
    try {
      const result = mutate();
      if (result instanceof Promise) throw new Error('Commands must remain synchronous');
      target.commandReceipts.set(key, { fingerprint, result });
      return result;
    } catch (error) {
      if (error instanceof AppError) target.commandReceipts.set(key, { fingerprint, error });
      throw error;
    }
  }
  return {
    bootId,
    get activity() {
      return activity;
    },
    createActivity,
    requireActivity,
    command,
  };
}
export type ActivityStore = ReturnType<typeof createStore>;
