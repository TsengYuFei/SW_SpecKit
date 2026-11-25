import { expect, it } from 'vitest';
import { automaticFixture } from '../helpers/automatic-writeback.js';
it('atomically ends, freezes results and queues exactly one automatic job then verifies exact grouped string values', async () => {
  const c = await automaticFixture();
  try {
    c.answer();
    c.run(c.b, 'answer:submit', {
      questionId: c.question.id,
      answers: Object.fromEntries(c.question.items.map((item) => [item.id, '第二組較晚答案'])),
    });
    c.end();
    const job = c.server.persistence.writebacks.getForActivity(c.activity.id)!;
    expect(job).toBeTruthy();
    expect(
      c.server.persistence.connection.database.prepare('SELECT * FROM results').all(),
    ).toHaveLength(2);
    await c.server.worker!.drain();
    expect(c.server.persistence.writebacks.getForActivity(c.activity.id)!.status).toBe('verified');
    expect(c.writes).toHaveLength(1);
    expect(c.grid.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
    const requestId = crypto.randomUUID();
    expect(() => c.run(c.teacher, 'activity:end', { requestId })).toThrow();
    expect(
      c.server.persistence.connection.database.prepare('SELECT * FROM writeback_jobs').all(),
    ).toHaveLength(1);
  } finally {
    await c.server.stop();
  }
});
it('ends a zero-answer scene with a verified zero-item job and no Google write', async () => {
  const c = await automaticFixture();
  try {
    c.end();
    await c.server.worker!.drain();
    expect(c.server.persistence.writebacks.getForActivity(c.activity.id)!.status).toBe('verified');
    expect(c.writes).toEqual([]);
  } finally {
    await c.server.stop();
  }
});

it('rolls end back entirely when the job insert fails, then admits the same final state once', async () => {
  const c = await automaticFixture();
  try {
    c.answer();
    const db = c.server.persistence.connection.database;
    db.exec(
      "CREATE TRIGGER fail_job BEFORE INSERT ON writeback_jobs BEGIN SELECT RAISE(ABORT,'synthetic job failure'); END",
    );
    expect(() => c.end()).toThrow();
    expect(c.server.persistence.activities.require(c.activity.id).phase).toBe('active');
    expect(db.prepare('SELECT * FROM results').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM writeback_jobs').all()).toEqual([]);
    db.exec('DROP TRIGGER fail_job');
    const requestId = crypto.randomUUID();
    const result = c.run(c.teacher, 'activity:end', { requestId });
    expect(c.run(c.teacher, 'activity:end', { requestId })).toEqual(result);
    await c.server.worker!.drain();
    expect(c.writes).toHaveLength(1);
    expect(db.prepare('SELECT * FROM writeback_jobs').all()).toHaveLength(1);
  } finally {
    await c.server.stop();
  }
});

it('does not write with a stale or different-account grant after a delayed precheck', async () => {
  const { deferred } = await import('../helpers/google-adapter.js');
  const c = await automaticFixture();
  const gate = deferred<void>(),
    entered = deferred<void>(),
    read = c.server.gateway.readSheetById!;
  try {
    c.server.gateway.readSheetById = async (...args) => {
      entered.resolve();
      await gate.promise;
      return read(...args);
    };
    c.answer();
    c.end();
    await entered.promise;
    await c.client.connect('owner-b');
    gate.resolve();
    await c.server.worker!.drain();
    const job = c.server.persistence.writebacks.getForActivity(c.activity.id)!;
    expect(c.server.persistence.writebacks.questions(String(job.id))[0]).toMatchObject({
      status: 'pending',
      safe_error_code: 'GOOGLE_AUTH_REQUIRED',
      write_attempt_count: 0,
      verification_failure_count: 0,
    });
    expect(c.writes).toEqual([]);
    c.server.gateway.readSheetById = read;
    await c.client.connect('owner-a');
    await c.server.worker!.drain();
    expect(c.server.persistence.writebacks.getForActivity(c.activity.id)!.status).toBe('verified');
    expect(c.writes).toHaveLength(1);
  } finally {
    gate.resolve();
    await c.server.stop();
  }
});

it('recovers a safe failed question while preserving another question conflict', async () => {
  const { workerFixture } = await import('../helpers/worker.js');
  const { createDurableWritebackService } = await import(
    '../../backend/src/google/durable-writeback-service.js'
  );
  const c = workerFixture({ active: true });
  const write = c.gateway.write;
  try {
    c.p.connection.transaction(() => {
      const participant = c.p.connection.database
        .prepare('SELECT id FROM participants LIMIT 1')
        .get()!;
      const question = c.activity.source.questions[1]!;
      c.p.participation.submit(
        c.activity.id,
        String(participant.id),
        question.id,
        crypto.randomUUID(),
        { [question.items[0]!.id]: '第二題答案' },
      );
      c.p.connection.database
        .prepare("UPDATE activities SET phase='ended',ended_at=? WHERE id=?")
        .run(10000, c.activity.id);
      c.p.writebacks.createForEnded(c.activity.id);
    });
    c.p.connection.database
      .prepare('UPDATE writeback_question_states SET next_attempt_at=10000')
      .run();
    c.grid.rows[1]![1] = { userEnteredValue: { stringValue: '外部改題' } };
    c.gateway.write = async () => {
      throw new (await import('../../backend/src/security/safe-errors.js')).AppError(
        'GOOGLE_FORBIDDEN',
      );
    };
    await c.worker.tick();
    expect(c.p.writebacks.getForActivity(c.activity.id)!.status).toBe('conflict');
    expect(c.p.writebacks.questions(c.jobId()).map((row) => row.status)).toEqual([
      'conflict',
      'failed',
    ]);
    c.gateway.write = write;
    const service = createDurableWritebackService(c.p, c.worker, () => ({
      accountId: 'test-owner-a',
    }));
    await service.recover('synthetic-session', c.activity.id, crypto.randomUUID(), 'retry');
    c.advance(Date.now());
    await c.worker.tick();
    expect(c.p.writebacks.questions(c.jobId()).map((row) => row.status)).toEqual([
      'conflict',
      'verified',
    ]);
    expect(c.writes).toHaveLength(1);
    expect(c.writes[0]).toHaveLength(1);
  } finally {
    await c.close();
  }
});
