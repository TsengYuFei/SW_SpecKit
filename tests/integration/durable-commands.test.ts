import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestProcess } from '../helpers/process-harness.js';
import { afterEach, expect, it } from 'vitest';
import { createPersistenceFixture } from '../helpers/persistence.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
function setup() {
  const fixture = createPersistenceFixture();
  cleanups.push(fixture.close);
  const sheet = sampleSheet();
  const activity = fixture.connection.transaction(() => {
    fixture.accounts.upsert({
      accountId: 'test-owner-a',
      displayEmail: 'a@example.invalid',
      displayName: '甲',
    });
    return fixture.activities.create({
      ownerAccountId: 'test-owner-a',
      groupCount: 2,
      source: {
        spreadsheetId: 'synthetic-source',
        spreadsheetTitle: '測試',
        sheet,
        questions: parseGuidedNotes([sheet]),
      },
    });
  });
  return { ...fixture, activity };
}

it('commits a durable command before publishing and replays the same result after an ack is lost', () => {
  const fixture = setup();
  const command = {
    activityId: fixture.activity.id,
    actorKey: 'teacher:test-owner-a',
    event: 'test:update',
    requestId: randomUUID(),
    payload: { value: 1 },
  };
  let calls = 0;
  const run = () =>
    fixture.commands.execute(command, () => {
      calls++;
      fixture.connection.database
        .prepare('UPDATE activities SET revision=revision+1 WHERE id=?')
        .run(fixture.activity.id);
      return { accepted: true };
    });
  expect(run()).toEqual({ accepted: true });
  fixture.connection.close();
  const reopened = createPersistenceFixture(fixture.directory);
  cleanups.push(reopened.close);
  expect(
    reopened.commands.execute(command, () => {
      throw new Error('must not rerun');
    }),
  ).toEqual({ accepted: true });
  expect(calls).toBe(1);
  expect(() =>
    reopened.commands.execute({ ...command, payload: { value: 2 } }, () => null),
  ).toThrow('請求編號');
  expect(reopened.activities.getOwned(fixture.activity.id, 'test-owner-a').revision).toBe(1);
});

it('rolls back mutations and never publishes success if a command fails', () => {
  const fixture = setup();
  let published = false;
  expect(() =>
    fixture.commands.execute(
      {
        activityId: fixture.activity.id,
        actorKey: 'teacher:test-owner-a',
        event: 'test:rollback',
        requestId: randomUUID(),
        payload: {},
      },
      () => {
        fixture.connection.database
          .prepare('UPDATE activities SET revision=99 WHERE id=?')
          .run(fixture.activity.id);
        fixture.connection.afterCommit(() => {
          published = true;
        });
        throw new Error('synthetic-internal-failure');
      },
    ),
  ).toThrow('系統');
  expect(fixture.activities.getOwned(fixture.activity.id, 'test-owner-a').revision).toBe(0);
  expect(published).toBe(false);
  fixture.connection.transaction(() => {
    fixture.connection.afterCommit(() => {
      expect(fixture.connection.inTransaction).toBe(false);
      published = true;
    });
  });
  expect(published).toBe(true);
});

it('keeps a global slot and makes group binding, name, complete answers and sequence atomic', () => {
  const fixture = setup();
  const [first, second] = fixture.activities.groups(fixture.activity.id);
  const actor = fixture.connection.transaction(() =>
    fixture.participation.participant('a'.repeat(64)),
  );
  fixture.connection.transaction(() =>
    fixture.participation.join(fixture.activity.id, first!.id, actor.id, '咕咕嘎嘎'),
  );
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.participation.join(fixture.activity.id, second!.id, actor.id, '別名'),
    ),
  ).toThrow();
  expect(
    fixture.activities.groups(fixture.activity.id).filter((group) => group.participantId),
  ).toHaveLength(1);
  fixture.connection.transaction(() =>
    fixture.activities.start(fixture.activity.id, 'test-owner-a'),
  );
  const question = fixture.activity.source.questions[0]!;
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.participation.submit(fixture.activity.id, actor.id, question.id, randomUUID(), {
        [question.items[0]!.id]: '不完整',
      }),
    ),
  ).toThrow('全部小題');
  const answers = Object.fromEntries(question.items.map((item) => [item.id, '回答']));
  const submission = fixture.connection.transaction(() =>
    fixture.participation.submit(fixture.activity.id, actor.id, question.id, randomUUID(), answers),
  );
  expect(submission.sequence).toBe(1);
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.participation.submit(
        fixture.activity.id,
        actor.id,
        question.id,
        randomUUID(),
        answers,
      ),
    ),
  ).toThrow('第一次');
  expect(fixture.activities.getOwned(fixture.activity.id, 'test-owner-a').nextSequence).toBe(2);
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.activities.create({
        ownerAccountId: 'test-owner-a',
        groupCount: 2,
        source: fixture.activity.source,
      }),
    ),
  ).toThrow('活動');
});

it('rolls back a disk-full transaction without saving a successful command receipt', () => {
  const fixture = setup();
  const pages = Number(fixture.connection.database.prepare('PRAGMA page_count').get()!.page_count);
  fixture.connection.database.exec(`PRAGMA max_page_count=${pages}`);
  const command = {
    activityId: fixture.activity.id,
    actorKey: 'teacher:test-owner-a',
    event: 'test:full',
    requestId: randomUUID(),
    payload: {},
  };
  expect(() =>
    fixture.commands.execute(command, () => {
      fixture.connection.database
        .prepare('UPDATE activities SET revision=77 WHERE id=?')
        .run(fixture.activity.id);
      fixture.accounts.upsert({
        accountId: 'large-synthetic-owner',
        displayEmail: 'x@example.invalid',
        displayName: 'x'.repeat(500000),
      });
      return { accepted: true };
    }),
  ).toThrow('儲存');
  expect(fixture.activities.getOwned(fixture.activity.id, 'test-owner-a').revision).toBe(0);
  expect(fixture.receipts.get(command)).toBeUndefined();
});

it.each(['before-commit', 'after-commit'])(
  'survives an actual child process kill at %s',
  async (checkpoint) => {
    const fixture = setup();
    const command = {
      activityId: fixture.activity.id,
      actorKey: 'teacher:test-owner-a',
      event: 'test:crash',
      requestId: randomUUID(),
      payload: {},
    };
    const entryPath = join(fixture.directory, 'crash-child.mjs');
    writeFileSync(
      entryPath,
      `
    import { DatabaseSync } from 'node:sqlite';
    const db=new DatabaseSync(process.env.DATABASE_PATH);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    db.prepare('UPDATE activities SET revision=revision+1 WHERE id=?').run(process.env.ACTIVITY_ID);
    db.prepare('INSERT INTO command_receipts VALUES(?,?,?,?,?,?,?)').run(
      process.env.ACTIVITY_ID,'teacher:test-owner-a','test:crash',process.env.REQUEST_ID,process.env.FINGERPRINT,
      JSON.stringify({ok:true,data:{accepted:true}}),Date.now());
    if(process.env.CHECKPOINT==='after-commit') db.exec('COMMIT');
    process.send({kind:'checkpoint'});
    process.on('message',()=>{});
  `,
    );
    const child = await startTestProcess({
      entryPath,
      env: {
        DATABASE_PATH: fixture.databasePath,
        ACTIVITY_ID: fixture.activity.id,
        REQUEST_ID: command.requestId,
        FINGERPRINT: fixture.receipts.fingerprint(command.payload),
        CHECKPOINT: checkpoint,
      },
    });
    cleanups.push(child.stop);
    await child.waitForMessage((value) => value.kind === 'checkpoint');
    child.child.kill('SIGKILL');
    await child.waitForExit();
    expect(fixture.activities.getOwned(fixture.activity.id, 'test-owner-a').revision).toBe(
      checkpoint === 'after-commit' ? 1 : 0,
    );
    if (checkpoint === 'after-commit')
      expect(
        fixture.commands.execute(command, () => {
          throw new Error('duplicate');
        }),
      ).toEqual({ accepted: true });
    else expect(fixture.receipts.get(command)).toBeUndefined();
  },
);

it('keeps settings private and protects name, answer and job state constraints', () => {
  const fixture = setup();
  fixture.connection.transaction(() => {
    fixture.accounts.upsert({
      accountId: 'test-owner-b',
      displayEmail: 'b@example.invalid',
      displayName: '乙',
    });
    fixture.accounts.saveSettings('test-owner-a', { defaultGroupCount: 4 });
  });
  expect(fixture.accounts.settings('test-owner-b')).toEqual({ defaultGroupCount: 2 });
  expect(fixture.accounts.settings('test-owner-a')).toEqual({ defaultGroupCount: 4 });
  expect(() => fixture.activities.getOwned(fixture.activity.id, 'test-owner-b')).toThrow('活動');
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.accounts.saveSettings('test-owner-a', { defaultGroupCount: 0 }),
    ),
  ).toThrow();
  const actor = fixture.connection.transaction(() =>
    fixture.participation.participant('b'.repeat(64)),
  );
  const other = fixture.connection.transaction(() =>
    fixture.participation.participant('c'.repeat(64)),
  );
  const group = fixture.activities.groups(fixture.activity.id)[0]!;
  for (const name of ['   ', '名'.repeat(41)])
    expect(() =>
      fixture.connection.transaction(() =>
        fixture.participation.join(fixture.activity.id, group.id, actor.id, name),
      ),
    ).toThrow();
  expect(fixture.activities.groups(fixture.activity.id)[0]!.participantId).toBeNull();
  fixture.connection.transaction(() =>
    fixture.participation.join(fixture.activity.id, group.id, actor.id, '名'.repeat(40)),
  );
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.participation.join(fixture.activity.id, group.id, other.id, '另一組'),
    ),
  ).toThrow('其他瀏覽器');
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.participation.join(fixture.activity.id, group.id, actor.id, '改名'),
    ),
  ).toThrow('無法更改');
  expect(() =>
    fixture.connection.transaction(() => fixture.writebacks.createForEnded(fixture.activity.id)),
  ).toThrow('階段');
  fixture.connection.transaction(() => {
    fixture.connection.database
      .prepare("UPDATE activities SET phase='ended' WHERE id=?")
      .run(fixture.activity.id);
    const job = fixture.writebacks.createForEnded(fixture.activity.id);
    expect(job.status).toBe('verified');
    expect(fixture.writebacks.createForEnded(fixture.activity.id).id).toBe(job.id);
  });
  expect(
    fixture.connection.database.prepare('SELECT COUNT(*) AS total FROM results').get(),
  ).toMatchObject({ total: 2 });
});

it('persists complete winning answers, bounds retry counters, and rejects stale-cycle updates', () => {
  const fixture = setup();
  const question = fixture.activity.source.questions[0]!;
  const actor = fixture.connection.transaction(() =>
    fixture.participation.participant('d'.repeat(64)),
  );
  const group = fixture.activities.groups(fixture.activity.id)[0]!;
  const submission = fixture.connection.transaction(() => {
    fixture.participation.join(fixture.activity.id, group.id, actor.id, '完整題組');
    fixture.activities.start(fixture.activity.id, 'test-owner-a');
    return fixture.participation.submit(
      fixture.activity.id,
      actor.id,
      question.id,
      randomUUID(),
      Object.fromEntries(question.items.map((item) => [item.id, '=純文字答案'])),
    );
  });
  const job = fixture.connection.transaction(() => {
    fixture.connection.database
      .prepare("UPDATE activities SET phase='ended' WHERE id=?")
      .run(fixture.activity.id);
    return fixture.writebacks.createForEnded(fixture.activity.id);
  });
  const jobId = String(job.id);
  expect(job.status).toBe('pending');
  expect(
    fixture.connection.database
      .prepare('SELECT winner_submission_id FROM results WHERE question_id=?')
      .get(question.id),
  ).toMatchObject({ winner_submission_id: submission.id });
  const pending = fixture.writebacks.questions(jobId)[0]!;
  expect(Object.keys(JSON.parse(String(pending.expected_answers_json)))).toHaveLength(2);
  const state = {
    status: 'pending' as const,
    safeErrorCode: null,
    retryCycle: 1,
    writeAttemptCount: 0,
    verificationFailureCount: 0,
    nextAttemptAt: Date.now(),
  };
  fixture.connection.transaction(() => {
    fixture.writebacks.updateQuestion(jobId, question.id, 0, state);
    fixture.writebacks.recordAttempt(jobId, question.id, {
      kind: 'verify',
      retryCycle: 1,
      outcome: 'started',
    });
  });
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.writebacks.updateQuestion(jobId, question.id, 0, state),
    ),
  ).toThrow('請求編號');
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.writebacks.updateQuestion(jobId, question.id, 1, { ...state, writeAttemptCount: 4 }),
    ),
  ).toThrow();
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.writebacks.updateQuestion(jobId, question.id, 1, {
        ...state,
        verificationFailureCount: 5,
      }),
    ),
  ).toThrow();
  expect(() =>
    fixture.connection.transaction(() =>
      fixture.writebacks.recordAttempt(jobId, question.id, {
        kind: 'write',
        retryCycle: 0,
        outcome: 'started',
      }),
    ),
  ).toThrow('請求編號');
  expect(fixture.writebacks.questions(jobId)[0]).toMatchObject({
    retry_cycle: 1,
    write_attempt_count: 0,
    verification_failure_count: 0,
  });
});

it('rejects sensitive receipt fields before saving them and rolls back the mutation', () => {
  const fixture = setup();
  const synthetic = 'invalid-sensitive-fixture-should-never-be-saved';
  expect(() =>
    fixture.commands.execute(
      {
        activityId: fixture.activity.id,
        actorKey: 'teacher:test-owner-a',
        event: 'test:unsafe-outcome',
        requestId: randomUUID(),
        payload: {},
      },
      () => {
        fixture.connection.database
          .prepare('UPDATE activities SET revision=12 WHERE id=?')
          .run(fixture.activity.id);
        return { csrfToken: synthetic };
      },
    ),
  ).toThrow('輸入');
  expect(fixture.activities.getOwned(fixture.activity.id, 'test-owner-a').revision).toBe(0);
  for (const suffix of ['', '-wal', '-shm'])
    if (existsSync(fixture.databasePath + suffix))
      expect(readFileSync(fixture.databasePath + suffix).toString('latin1')).not.toContain(
        synthetic,
      );
});
