import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
import { openTemporaryDatabase } from '../helpers/temporary-database.js';

it('persists the canonical crossed receipts, complete grouped answers and unjoined third group', async () => {
  const c = await resultExportFixture();
  try {
    const snapshot = c.snapshot(c.histories[0]!);
    expect(snapshot.questions.map((q) => [q.displayNumber, q.kind, q.items.length])).toEqual([
      ['1', 'single', 1],
      ['2', 'group', 2],
    ]);
    expect(snapshot.questions.flatMap((q) => q.items.map((i) => i.prompt))).toEqual([
      '3+4？',
      '水的化學式？',
      '水的沸點？',
    ]);
    expect(snapshot.groups.map((g) => [g.ordinal, g.name, g.occupied])).toEqual([
      [1, '甲組', true],
      [2, '乙組', true],
      [3, '', false],
    ]);
    expect(
      snapshot.submissions!.map((s) => [
        s.sequence,
        snapshot.groups.find((g) => g.id === s.groupId)!.ordinal,
        snapshot.questions.find((q) => q.id === s.questionId)!.displayNumber,
        Object.values(s.answers),
      ]),
    ).toEqual([
      [1, 1, '2', ['H₂O', '100°C']],
      [2, 2, '1', ['7']],
      [3, 2, '2', ['HO₂', '90°C']],
      [4, 1, '1', ['8']],
    ]);
    expect(snapshot.results!.map((r) => r.winnerGroup!.ordinal)).toEqual([2, 1]);
    expect(c.server.persistence.activities.require(snapshot.activityId).nextSequence).toBe(5);
    expect(
      c.server.persistence.connection.database.prepare('PRAGMA foreign_key_check').all(),
    ).toEqual([]);
    expect(c.googleCalls).toEqual({ read: 0, write: 0 });
  } finally {
    await c.close();
  }
});

it('keeps multiple ended histories and one active activity with controlled writeback states', async () => {
  const c = await resultExportFixture({ historyCount: 2, active: true, jobStatus: 'conflict' });
  try {
    expect(c.histories).toHaveLength(2);
    for (const id of c.histories) {
      expect(c.snapshot(id).phase).toBe('ended');
      expect(c.server.persistence.writebacks.getForActivity(id)!.status).toBe('conflict');
    }
    expect(c.snapshot(c.activeActivity!).phase).toBe('active');
    expect(c.server.persistence.activities.current()!.id).toBe(c.activeActivity);
    await c.setGoogleOffline(true);
    await expect(c.server.gateway.read('source-one', {})).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(c.snapshot(c.histories[0]!).submissions).toHaveLength(4);
  } finally {
    await c.close();
  }
});

it('builds the 30-group, 20-question, 40-row performance dataset without truncation', async () => {
  const c = await resultExportFixture({ kind: 'performance' });
  try {
    const s = c.snapshot(c.histories[0]!);
    expect(s.groups).toHaveLength(30);
    expect(s.questions).toHaveLength(20);
    expect(s.questions.flatMap((q) => q.items)).toHaveLength(40);
    expect(s.submissions).toHaveLength(600);
    expect(s.submissions!.flatMap((entry) => Object.values(entry.answers))).toHaveLength(1200);
    expect(s.submissions!.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: 600 }, (_, i) => i + 1),
    );
  } finally {
    await c.close();
  }
});

it('can remove an entire nonwinner while retaining the counter and frozen winners for corruption tests', async () => {
  const c = await resultExportFixture();
  try {
    const id = c.histories[0]!;
    const before = c.snapshot(id);
    c.injectFault(id, 'missing-nonwinner');
    const after = c.snapshot(id);
    expect(after.submissions).toHaveLength(3);
    expect(after.results).toEqual(before.results);
    expect(c.server.persistence.activities.require(id).nextSequence).toBe(5);
    expect(
      c.server.persistence.connection.database.prepare('PRAGMA foreign_key_check').all(),
    ).toEqual([]);
    expect(() =>
      c.injectFault('00000000-0000-4000-8000-000000000000', 'missing-nonwinner'),
    ).toThrow();
  } finally {
    await c.close();
  }
});

it('cleans only its verified temporary directory, refuses child paths and closes idempotently', async () => {
  const a = await resultExportFixture();
  let b: Awaited<ReturnType<typeof resultExportFixture>> | undefined;
  try {
    b = await resultExportFixture();
    const child = join(a.server.persistence.directory, 'child');
    mkdirSync(child);
    expect(() => openTemporaryDatabase(child)).toThrow();
    await a.close();
    await a.close();
    expect(existsSync(a.server.persistence.directory)).toBe(false);
    expect(existsSync(b.server.persistence.databasePath)).toBe(true);
    expect(b.snapshot(b.histories[0]!).submissions).toHaveLength(4);
  } finally {
    await a.close();
    await b?.close();
  }
});

it('rejects invalid fixture sizes before opening listeners or databases', async () => {
  for (const historyCount of [0, -1, 1.5, 11, NaN])
    await expect(resultExportFixture({ historyCount })).rejects.toThrow('無效的合成場次數');
});
