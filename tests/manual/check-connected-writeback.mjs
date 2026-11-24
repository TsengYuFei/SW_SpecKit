// Read-only verification of the public writeback status; no Google credentials are accessed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const [activityId] = process.argv.slice(2);
assert.match(activityId ?? '', /^[0-9a-f-]{36}$/);
const origin = 'http://127.0.0.1:3000';
const response = await fetch(`${origin}/api/session`);
const cookie = response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const socket = io(origin, {
  transports: ['websocket'],
  reconnection: false,
  extraHeaders: { Origin: origin, Cookie: cookie },
});
try {
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', () => reject(new Error('CONNECTION_FAILED')));
  });
  const result = await socket
    .timeout(3000)
    .emitWithAck('activity:subscribe', { activityId, requestId: randomUUID() });
  assert.equal(result.ok, true);
  const operation = result.data.writebacks.at(-1);
  console.log(
    JSON.stringify({
      phase: result.data.phase,
      writeback: operation?.status ?? 'not_started',
      questions:
        operation?.questions.map((q) => ({
          questionId: q.questionId,
          status: q.status,
          itemCount: Object.keys(q.itemStatuses).length,
        })) ?? [],
    }),
  );
  if (operation?.status !== 'verified') process.exitCode = 2;
} catch {
  console.error('PUBLIC_WRITEBACK_STATUS_CHECK_FAILED');
  process.exitCode = 1;
} finally {
  socket.disconnect();
}
