import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createPersistenceFixture } from '../helpers/persistence.js';
import { freePort, startProductionTestProcess } from '../helpers/production-process.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { createPersistentCommands } from '../../backend/src/activity/persistent-commands.js';
import { readPersistentActivity } from '../../backend/src/activity/persistent-store.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';

it('preserves three activities and resumes original anonymous students across an actual Node stop/restart without Google authorization', async () => {
  let p = createPersistenceFixture();
  const directory = p.directory,
    databasePath = p.databasePath;
  const sessions = createSessions(p.participation),
    a = sessions.create('student'),
    b = sessions.create('student');
  const teacher = sessions.create('teacher'),
    store = createStore(100),
    sheet = sampleSheet(17),
    source = {
      spreadsheetId: 'source-one',
      spreadsheetTitle: '保存教材',
      sheet,
      questions: parseGuidedNotes([sheet]),
    };
  const commands = createPersistentCommands(store, p, () => ({ accountId: 'test-owner-a' }));
  p.connection.transaction(() => {
    p.accounts.upsert({
      accountId: 'test-owner-a',
      displayName: 'A',
      displayEmail: 'a@example.invalid',
    });
    p.accounts.saveSettings('test-owner-a', { defaultGroupCount: 4 });
  });
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    const activity = p.connection.transaction(() =>
      p.activities.create({ ownerAccountId: 'test-owner-a', groupCount: 2, source }),
    );
    ids.push(activity.id);
    store.installActivity(readPersistentActivity(p, store, activity.id));
    const run = (actor: typeof a, event: string, extra = {}) =>
      commands(actor, event, { activityId: activity.id, requestId: randomUUID(), ...extra });
    const groups = p.activities.groups(activity.id);
    run(a, 'group:join', { groupId: groups[0]!.id, name: '原甲組' });
    run(b, 'group:join', { groupId: groups[1]!.id, name: '原乙組' });
    run(teacher, 'activity:start');
    if (index !== 1)
      for (const actor of [a, b])
        run(actor, 'answer:submit', {
          questionId: source.questions[0]!.id,
          answers: Object.fromEntries(
            source.questions[0]!.items.map((item) => [item.id, actor === a ? '甲答案' : '乙答案']),
          ),
        });
    if (index < 2) {
      run(teacher, 'activity:end');
      const job = p.writebacks.getForActivity(activity.id)!;
      p.connection.transaction(() => {
        for (const row of p.writebacks.questions(String(job.id)))
          p.writebacks.updateQuestion(String(job.id), String(row.question_id), 0, {
            status: 'verified',
            safeErrorCode: null,
            retryCycle: 0,
            writeAttemptCount: 0,
            verificationFailureCount: 0,
            nextAttemptAt: null,
          });
      });
    }
  }
  const activeId = ids[2]!,
    cookieA = sessions.cookie(a),
    cookieB = sessions.cookie(b),
    ports = { teacher: await freePort(), student: await freePort() };
  const before = p.activities.require(activeId);
  p.connection.close();
  let process: Awaited<ReturnType<typeof startProductionTestProcess>> | undefined;
  const sockets: Socket[] = [];
  const payload = {
    activityId: activeId,
    requestId: randomUUID(),
    questionId: source.questions[1]!.id,
    answers: { [source.questions[1]!.items[0]!.id]: '重啟續答' },
  };
  try {
    process = await startProductionTestProcess(directory, databasePath, ports);
    async function connect(cookie: string) {
      const socket = io(process!.studentUrl, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: process!.studentUrl, Cookie: cookie },
      });
      sockets.push(socket);
      await new Promise<void>((done, reject) => {
        socket.once('connect', done);
        socket.once('connect_error', () => reject(new Error('TEST_LOCAL_CONNECTION_FAILED')));
      });
      return socket;
    }
    const sa = await connect(cookieA),
      sb = await connect(cookieB);
    const subscribe = (socket: Socket) =>
      socket
        .timeout(2000)
        .emitWithAck('activity:subscribe', { activityId: activeId, requestId: randomUUID() });
    const first = await subscribe(sa);
    expect(first.data.phase).toBe('active');
    expect(first.data.self.receipts).toHaveLength(1);
    expect(
      first.data.groups.find((group: { id: string }) => group.id === first.data.self.groupId).name,
    ).toBe('原甲組');
    expect((await fetch(process.teacherUrl + '/api/activities')).status).toBe(401);
    expect((await sa.timeout(2000).emitWithAck('answer:submit', payload)).ok).toBe(true);
    expect(
      (await sb.timeout(2000).emitWithAck('answer:submit', { ...payload, requestId: randomUUID() }))
        .ok,
    ).toBe(true);
    for (const socket of sockets.splice(0)) socket.disconnect();
    const oldBoot = process.bootId;
    await process.stop();
    process = await startProductionTestProcess(directory, databasePath, ports);
    expect(process.bootId).not.toBe(oldBoot);
    const restored = await connect(cookieA),
      snapshot = await subscribe(restored);
    expect(snapshot.data.phase).toBe('active');
    expect(snapshot.data.self.receipts).toHaveLength(2);
    expect((await restored.timeout(2000).emitWithAck('answer:submit', payload)).ok).toBe(true);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await process.stop();
    process = undefined;
    p = createPersistenceFixture(directory);
    expect(p.accounts.settings('test-owner-a')).toEqual({ defaultGroupCount: 4 });
    expect(
      p.connection.database.prepare('SELECT count(*) AS n FROM activities').get(),
    ).toMatchObject({ n: 3 });
    expect(ids.slice(0, 2).map((id) => p.activities.require(id).phase)).toEqual(['ended', 'ended']);
    const after = p.activities.require(activeId);
    expect(after.phase).toBe('active');
    expect(after.nextSequence).toBe(before.nextSequence + 2);
    expect(
      p.connection.database
        .prepare('SELECT sequence FROM submissions WHERE activity_id=? ORDER BY sequence')
        .all(activeId),
    ).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }]);
    expect(p.writebacks.getForActivity(activeId)).toBeUndefined();
    expect(p.activities.groups(activeId).map((group) => group.name)).toEqual(['原甲組', '原乙組']);
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (process) await process.stop();
    p.connection.close();
    p.cleanup();
  }
}, 30000);

it.each(['waiting', 'ended'] as const)(
  'restores a saved %s phase without ending or reopening it',
  async (phase) => {
    let p = createPersistenceFixture();
    const directory = p.directory,
      databasePath = p.databasePath,
      sheet = sampleSheet(17);
    const activity = p.connection.transaction(() => {
      p.accounts.upsert({
        accountId: 'test-owner-a',
        displayName: 'A',
        displayEmail: 'a@example.invalid',
      });
      const activity = p.activities.create({
        ownerAccountId: 'test-owner-a',
        groupCount: 2,
        source: {
          spreadsheetId: 'source-one',
          spreadsheetTitle: '教材',
          sheet,
          questions: parseGuidedNotes([sheet]),
        },
      });
      if (phase === 'ended') {
        p.activities.start(activity.id, 'test-owner-a');
        p.connection.database
          .prepare("UPDATE activities SET phase='ended',ended_at=? WHERE id=?")
          .run(Date.now(), activity.id);
        p.writebacks.createForEnded(activity.id);
      }
      return activity;
    });
    const sessions = createSessions(p.participation),
      student = sessions.create('student'),
      cookie = sessions.cookie(student),
      ports = { teacher: await freePort(), student: await freePort() };
    p.connection.close();
    let child: Awaited<ReturnType<typeof startProductionTestProcess>> | undefined,
      socket: Socket | undefined;
    try {
      child = await startProductionTestProcess(directory, databasePath, ports);
      socket = io(child.studentUrl, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: child.studentUrl, Cookie: cookie },
      });
      await new Promise<void>((done, reject) => {
        socket!.once('connect', done);
        socket!.once('connect_error', () => reject(new Error('TEST_LOCAL_CONNECTION_FAILED')));
      });
      const response = await socket
        .timeout(2000)
        .emitWithAck('activity:subscribe', { activityId: activity.id, requestId: randomUUID() });
      expect(response.data.phase).toBe(phase);
      if (phase === 'waiting') expect(response.data.questions).toEqual([]);
      socket.disconnect();
      await child.stop();
      child = undefined;
      p = createPersistenceFixture(directory);
      expect(p.activities.require(activity.id).phase).toBe(phase);
      expect(Boolean(p.writebacks.getForActivity(activity.id))).toBe(phase === 'ended');
    } finally {
      socket?.disconnect();
      await child?.stop();
      p.connection.close();
      p.cleanup();
    }
  },
  20000,
);
