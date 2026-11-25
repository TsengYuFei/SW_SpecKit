// Opt-in integration probe for an already loaded source on the local service.
// Anonymous cookies and CSRF tokens stay in this process and are never printed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const [activityId, expectedSpreadsheetId] = process.argv.slice(2);
assert.match(activityId ?? '', /^[0-9a-f-]{36}$/);
assert.match(expectedSpreadsheetId ?? '', /^[A-Za-z0-9_-]+$/);
const teacherOrigin = 'http://127.0.0.1:3000';
const studentOrigin = 'http://127.0.0.1:3001';
const sockets = [];

async function identity(origin) {
  const response = await fetch(`${origin}/api/session`);
  const result = await response.json();
  assert.equal(result.ok, true);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrf: result.data.csrfToken };
}
async function http(path, session, body) {
  const response = await fetch(`${teacherOrigin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: session.cookie,
      Origin: teacherOrigin,
      'X-CSRF-Token': session.csrf,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(result.ok, true, result.error?.code);
  return result.data;
}
async function connect(origin, session) {
  const socket = io(origin, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: origin, Cookie: session.cookie },
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', () => reject(new Error('SOCKET_CONNECTION_FAILED')));
  });
  return socket;
}
async function command(socket, event, extra = {}) {
  const result = await socket
    .timeout(3000)
    .emitWithAck(event, { activityId, requestId: randomUUID(), ...extra });
  assert.equal(result.ok, true, result.error?.code);
  return result.data;
}
function phaseWithin(socket, phase) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PHASE_SYNC_OVER_2_SECONDS')), 2000);
    socket.once('activity:phase', (event) => {
      clearTimeout(timer);
      assert.equal(event.phase, phase);
      resolve();
    });
  });
}
try {
  const teacher = await identity(teacherOrigin);
  const preview = await http(`/api/activities/${activityId}`, teacher);
  assert.equal(preview.phase, 'waiting');
  assert.equal(preview.groupCount, 2);
  assert.equal(preview.source?.spreadsheetId, expectedSpreadsheetId);
  assert.equal(preview.source?.loadState, 'ready');
  const a = await connect(studentOrigin, await identity(studentOrigin));
  const b = await connect(studentOrigin, await identity(studentOrigin));
  const control = await connect(teacherOrigin, teacher);
  const initial = await command(a, 'activity:subscribe');
  assert.equal(
    initial.groups.every((g) => !g.occupied),
    true,
    'ACTIVITY_MUST_HAVE_EMPTY_GROUPS',
  );
  assert.equal(initial.questions.length, 6);
  assert.equal(
    initial.questions.every((q) => q.kind === 'single'),
    true,
  );
  await command(b, 'activity:subscribe');
  await command(control, 'activity:subscribe');
  await command(a, 'group:join', { groupId: initial.groups[0].id });
  await command(b, 'group:join', { groupId: initial.groups[1].id });
  await http(`/api/activities/${activityId}/source/confirm`, teacher, {
    mappingVersion: preview.source.mappingVersion,
  });
  const started = [phaseWithin(a, 'active'), phaseWithin(b, 'active')];
  await command(control, 'activity:start');
  await Promise.all(started);
  const first = initial.questions[0];
  const second = initial.questions[1];
  assert.match(first.items[0].prompt, /執行|處理|大腦/);
  assert.match(second.items[0].prompt, /二進位|資料|數字/);
  await command(a, 'answer:submit', {
    questionId: first.id,
    answers: { [first.items[0].id]: 'CPU' },
  });
  await command(b, 'answer:submit', {
    questionId: first.id,
    answers: { [first.items[0].id]: '中央處理器' },
  });
  await command(b, 'answer:submit', {
    questionId: second.id,
    answers: { [second.items[0].id]: '二進位' },
  });
  const privateSnapshot = await command(a, 'activity:subscribe');
  assert.equal('submissions' in privateSnapshot || 'results' in privateSnapshot, false);
  assert.equal(JSON.stringify(privateSnapshot).includes('中央處理器'), false);
  const ended = [phaseWithin(a, 'ended'), phaseWithin(b, 'ended')];
  await command(control, 'activity:end');
  await Promise.all(ended);
  const resultsA = await command(a, 'activity:subscribe');
  const resultsB = await command(b, 'activity:subscribe');
  assert.deepEqual(resultsA.results, resultsB.results);
  assert.equal(resultsA.results[0].winnerGroup.ordinal, 1);
  assert.equal(resultsA.results[1].winnerGroup.ordinal, 2);
  assert.equal(
    resultsA.results.slice(2).every((r) => r.winnerGroup === null),
    true,
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      sourceQuestionCount: 6,
      anonymousGroups: 2,
      phaseSyncWithin2Seconds: true,
      winners: [1, 2],
      unanswered: 4,
      writeback: 'NOT_STARTED_USE_AUTHORIZED_TEACHER_PAGE',
    }),
  );
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? 'LIVE_ACTIVITY_ASSERTION_FAILED'
      : 'LIVE_ACTIVITY_PROBE_FAILED',
  );
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
}
