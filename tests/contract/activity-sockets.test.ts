import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createListener } from '../../backend/src/server.js';
import { readConfig } from '../../backend/src/config.js';
import type { Envelope } from '../../shared/src/events/envelope.js';
import { classroom } from '../helpers/activity.js';
import { listen, close } from '../helpers/server.js';

const cleanup: (() => Promise<void>)[] = [];
const clients: Socket[] = [];
afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  for (const stop of cleanup.splice(0)) await stop();
});

it('enforces every command role and schema and broadcasts across both listeners without leaking progress', async () => {
  const c = classroom();
  async function connect(role: 'teacher' | 'student', session: typeof c.a) {
    const server = createListener(role, c.store, c.sessions, readConfig({}));
    const url = await listen(server.server);
    cleanup.push(async () => {
      server.io.disconnectSockets(true);
      await close(server.server);
    });
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: url, Cookie: c.sessions.cookie(session) },
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const teacher = await connect('teacher', c.teacher);
  const student = await connect('student', c.a);
  const command = async (socket: Socket, event: string, extra = {}) =>
    (await socket.timeout(2000).emitWithAck(event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    })) as Envelope<unknown>;
  expect((await command(teacher, 'activity:subscribe')).ok).toBe(true);
  expect((await command(student, 'activity:subscribe')).ok).toBe(true);
  expect(await command(student, 'activity:start')).toMatchObject({
    ok: false,
    error: { code: 'FORBIDDEN' },
  });
  expect(
    await command(teacher, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' }),
  ).toMatchObject({
    ok: false,
    error: { code: 'FORBIDDEN' },
  });
  expect(
    await command(student, 'group:join', {
      groupId: c.groups[0]!.id,
      name: '測試組',
      role: 'teacher',
    }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  expect(
    (await command(student, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' })).ok,
  ).toBe(true);
  expect(await command(student, 'group:rename', { name: '咕咕嘎嘎' })).toMatchObject({
    ok: false,
    error: { code: 'NAME_LOCKED' },
  });
  const phase = new Promise<unknown>((resolve) => student.once('activity:phase', resolve));
  expect((await command(teacher, 'activity:start')).ok).toBe(true);
  expect(await phase).toMatchObject({ phase: 'active' });
  const packets: string[] = [];
  student.onAny((name, data) => packets.push(JSON.stringify([name, data])));
  const progress = new Promise<unknown>((resolve) => teacher.once('teacher:progress', resolve));
  const accepted = await command(student, 'answer:submit', {
    questionId: c.question.id,
    answers: Object.fromEntries(c.question.items.map((item) => [item.id, 'secret-answer'])),
  });
  expect(accepted).toMatchObject({ ok: true, data: { accepted: true, questionId: c.question.id } });
  expect(JSON.stringify(await progress)).toContain('secret-answer');
  expect(packets.join('')).not.toMatch(/secret-answer|sequence|receivedAt|teacher:progress/);
  expect((await command(teacher, 'activity:end')).ok).toBe(true);
  expect(await command(student, 'activity:subscribe', { activityId: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: 'ACTIVITY_UNAVAILABLE' },
  });
});

it('arbitrates simultaneous sockets, preserves identity across reconnect, and limits mutation rate', async () => {
  const c = classroom();
  const server = createListener('student', c.store, c.sessions, readConfig({}));
  const url = await listen(server.server);
  cleanup.push(async () => {
    server.io.disconnectSockets(true);
    await close(server.server);
  });
  async function connect(session: typeof c.a) {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: url, Cookie: c.sessions.cookie(session) },
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const a = await connect(c.a);
  const b = await connect(c.b);
  const command = async (socket: Socket, event: string, extra = {}) =>
    (await socket.timeout(2000).emitWithAck(event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    })) as Envelope<unknown>;
  const races = await Promise.all([
    command(a, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' }),
    command(b, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' }),
  ]);
  expect(races.filter((result) => result.ok)).toHaveLength(1);
  expect(races.filter((result) => !result.ok)).toMatchObject([
    { error: { code: 'GROUP_OCCUPIED' } },
  ]);
  const loser = races[0]!.ok ? b : a;
  expect(
    (await command(loser, 'group:join', { groupId: c.groups[1]!.id, name: '測試組' })).ok,
  ).toBe(true);
  c.activity.phase = 'active';
  const payload = {
    questionId: c.question.id,
    answers: Object.fromEntries(c.question.items.map((i) => [i.id, 'answer'])),
  };
  expect(
    (
      await Promise.all([
        command(a, 'answer:submit', payload),
        command(b, 'answer:submit', payload),
      ])
    ).every((r) => r.ok),
  ).toBe(true);
  expect([...c.activity.submissions.values()].map((s) => s.sequence)).toEqual([1, 2]);
  a.disconnect();
  const recovered = await connect(c.a);
  expect(await command(recovered, 'activity:subscribe')).toMatchObject({
    ok: true,
    data: { self: { receipts: [{ accepted: true }] } },
  });
  expect(await command(recovered, 'group:rename', { name: ' '.repeat(5) })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' },
  });
  const limited = await Promise.all(
    Array.from({ length: 12 }, () => command(recovered, 'group:rename', { name: '組名' })),
  );
  expect(limited.some((r) => !r.ok && r.error.code === 'RATE_LIMITED')).toBe(true);
});
