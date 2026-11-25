import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { catalogClassroom } from '../helpers/activity.js';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const stop of stops.splice(0)) await stop();
});
it('commits a single immutable group name and replays the exact receipt after acknowledgement loss', async () => {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const payload = {
    activityId: c.activity.id,
    requestId: randomUUID(),
    groupId: c.groups[0]!.id,
    name: '名'.repeat(40),
  };
  const first = executeCommand(c.store, c.a, 'group:join', payload);
  expect(executeCommand(c.store, c.a, 'group:join', payload)).toEqual(first);
  expect(() =>
    executeCommand(c.store, c.a, 'group:join', { ...payload, name: '不同內容' }),
  ).toThrowError(expect.objectContaining({ code: 'REQUEST_CONFLICT' }));
  expect(() =>
    executeCommand(c.store, c.b, 'group:join', {
      ...payload,
      requestId: randomUUID(),
      name: '另一組',
    }),
  ).toThrow();
  expect(c.server.persistence.activities.groups(c.activity.id)[0]).toMatchObject({
    participantId: c.a.sessionId,
    name: '名'.repeat(40),
  });
  expect(
    c.server.persistence.connection.database
      .prepare('SELECT count(*) AS n FROM command_receipts')
      .get(),
  ).toMatchObject({ n: 2 });
});
it('commits complete first answers and common sequence independently of a backwards clock', async () => {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const run = (session: typeof c.a, event: string, extra = {}) =>
    executeCommand(c.store, session, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '<A>' });
  run(c.b, 'group:join', { groupId: c.groups[1]!.id, name: 'B' });
  run(c.teacher, 'activity:start');
  expect(() => run(c.a, 'answer:submit', { questionId: c.question.id, answers: {} })).toThrow();
  const body = {
    activityId: c.activity.id,
    requestId: randomUUID(),
    questionId: c.question.id,
    answers: Object.fromEntries(c.question.items.map((item) => [item.id, '完整答案'])),
  };
  const first = executeCommand(c.store, c.a, 'answer:submit', body);
  expect(executeCommand(c.store, c.a, 'answer:submit', body)).toEqual(first);
  vi.spyOn(Date, 'now').mockReturnValue(1);
  run(c.b, 'answer:submit', { questionId: c.question.id, answers: body.answers });
  const rows = c.server.persistence.connection.database
    .prepare('SELECT sequence FROM submissions ORDER BY sequence')
    .all();
  expect(rows).toEqual([{ sequence: 1 }, { sequence: 2 }]);
  run(c.teacher, 'activity:end');
  expect(() =>
    run(c.a, 'answer:submit', { questionId: c.question.id, answers: body.answers }),
  ).toThrow();
  expect(c.server.persistence.activities.require(c.activity.id).phase).toBe('ended');
});
it('rolls back before mutating the visible group when persistence fails', async () => {
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const database = c.server.persistence.connection.database;
  database.exec('PRAGMA query_only=ON');
  expect(() =>
    executeCommand(c.store, c.a, 'group:join', {
      activityId: c.activity.id,
      requestId: randomUUID(),
      groupId: c.groups[0]!.id,
      name: '不可假成功',
    }),
  ).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
  expect(c.store.activity!.groups.get(c.groups[0]!.id)!.browserSessionId).toBeNull();
  database.exec('PRAGMA query_only=OFF');
});

it('arbitrates competing joins and near-simultaneous complete answers through the real Socket.IO entry', async () => {
  const { io } = await import('socket.io-client');
  const c = await catalogClassroom();
  stops.push(c.server.stop);
  const sockets: ReturnType<typeof io>[] = [];
  try {
    async function connect(session: typeof c.a) {
      const socket = io(c.server.studentUrl, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: c.server.studentUrl, Cookie: c.sessions.cookie(session) },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    }
    const a = await connect(c.a),
      b = await connect(c.b);
    const send = (socket: typeof a, event: string, extra: object) =>
      socket
        .timeout(2000)
        .emitWithAck(event, { activityId: c.activity.id, requestId: randomUUID(), ...extra });
    const races = await Promise.all([
      send(a, 'group:join', { groupId: c.groups[0]!.id, name: 'A' }),
      send(b, 'group:join', { groupId: c.groups[0]!.id, name: 'B' }),
    ]);
    expect(races.filter((result) => result.ok)).toHaveLength(1);
    expect(races.find((result) => !result.ok)).toMatchObject({ error: { code: 'GROUP_OCCUPIED' } });
    const loser = races[0].ok ? b : a;
    expect(
      await send(loser, 'group:join', { groupId: c.groups[1]!.id, name: '第二組' }),
    ).toMatchObject({ ok: true });
    executeCommand(c.store, c.teacher, 'activity:start', {
      activityId: c.activity.id,
      requestId: randomUUID(),
    });
    const answers = Object.fromEntries(c.question.items.map((item) => [item.id, '整題組答案']));
    const results = await Promise.all([
      send(a, 'answer:submit', { questionId: c.question.id, answers }),
      send(b, 'answer:submit', { questionId: c.question.id, answers }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    for (const result of results)
      expect(JSON.stringify(result)).not.toMatch(/sequence|receivedAt|整題組答案/);
    expect(
      c.server.persistence.connection.database
        .prepare('SELECT sequence FROM submissions ORDER BY sequence')
        .all(),
    ).toEqual([{ sequence: 1 }, { sequence: 2 }]);
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
});
