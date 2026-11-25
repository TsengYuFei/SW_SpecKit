// Opt-in local business-data verification across a real service restart. No cookies, credentials or raw answers are exported.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const [mode, inputPath] = process.argv.slice(2);
assert.ok(['capture', 'verify'].includes(mode), 'USE_CAPTURE_OR_VERIFY');
const databasePath = resolve(inputPath ?? process.env.DATABASE_PATH ?? 'data/classroom.sqlite');
const evidencePath = fileURLToPath(
  new URL('../../validation-results/workflow-v2-restart-evidence.json', import.meta.url),
);
const db = new DatabaseSync(databasePath, { readOnly: true });
const tables = [
  'activities',
  'runtime_state',
  'questions',
  'question_items',
  'activity_groups',
  'submissions',
  'submission_answers',
  'results',
  'writeback_jobs',
  'writeback_question_states',
  'writeback_attempts',
  'teacher_settings',
];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
let snapshot;
try {
  db.exec('BEGIN');
  const active = db.prepare("SELECT id,next_sequence FROM activities WHERE phase='active'").get();
  assert.ok(active, 'REQUIRES_ACTIVE_ACTIVITY');
  const counts = {
    activities: Number(db.prepare('SELECT count(*) AS n FROM activities').get().n),
    ended: Number(db.prepare("SELECT count(*) AS n FROM activities WHERE phase='ended'").get().n),
    activeSubmissions: Number(
      db.prepare('SELECT count(*) AS n FROM submissions WHERE activity_id=?').get(active.id).n,
    ),
  };
  assert.ok(
    counts.activities >= 3 && counts.ended >= 2 && counts.activeSubmissions >= 2,
    'REQUIRES_THREE_ACTIVITIES_AND_TWO_ACTIVE_SUBMISSIONS',
  );
  const hashes = Object.fromEntries(
    tables.map((table) => {
      const rows = db
        .prepare('SELECT * FROM ' + table)
        .all()
        .map((row) => JSON.stringify(canonical(row)))
        .sort();
      return [table, createHash('sha256').update(JSON.stringify(rows)).digest('hex')];
    }),
  );
  snapshot = {
    feature: '002-optimize-classroom-workflow',
    activeActivityId: String(active.id),
    nextSequence: Number(active.next_sequence),
    counts,
    hashes,
  };
  db.exec('ROLLBACK');
} finally {
  db.close();
}
if (mode === 'capture') {
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(
    evidencePath,
    JSON.stringify({ capturedAt: new Date().toISOString(), ...snapshot }, null, 2) + '\n',
  );
  console.log('CAPTURED: business IDs, counts and hashes only.');
} else {
  const before = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(snapshot.activeActivityId, before.activeActivityId, 'ACTIVE_ACTIVITY_CHANGED');
  assert.equal(snapshot.nextSequence, before.nextSequence, 'SEQUENCE_CHANGED');
  assert.deepEqual(snapshot.counts, before.counts, 'COUNTS_CHANGED');
  assert.deepEqual(snapshot.hashes, before.hashes, 'SAVED_BUSINESS_DATA_CHANGED');
  console.log(
    'PASS: saved business data and active sequence match. Verify original student browsers can continue next.',
  );
}
