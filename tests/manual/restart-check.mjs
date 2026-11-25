// Opt-in evidence capture/check across a real computer reboot. Never stores cookies or tokens.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';

const [mode, activityId] = process.argv.slice(2);
assert.ok(['capture', 'verify'].includes(mode));
const origin = 'http://127.0.0.1:3000';
const evidencePath = new URL('../../validation-results/restart-evidence.json', import.meta.url);
const response = await fetch(`${origin}/api/session`);
const session = await response.json();
assert.equal(session.ok, true);
const cookie = response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const socket = io(origin, {
  transports: ['websocket'],
  reconnection: false,
  extraHeaders: { Origin: origin, Cookie: cookie },
});
async function subscribe(id) {
  return await socket
    .timeout(3000)
    .emitWithAck('activity:subscribe', { activityId: id, requestId: randomUUID() });
}
try {
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', () => reject(new Error('LOCAL_CONNECTION_FAILED')));
  });
  if (mode === 'capture') {
    assert.match(activityId ?? '', /^[0-9a-f-]{36}$/);
    const result = await subscribe(activityId);
    assert.equal(result.ok, true);
    assert.equal(result.data.phase, 'active', 'REQUIRES_ACTIVE_ACTIVITY');
    assert.ok(result.data.submissions.length > 0, 'REQUIRES_ACCEPTED_SUBMISSION');
    const evidence = {
      capturedAt: new Date().toISOString(),
      bootId: result.data.bootId,
      activityId,
      phase: result.data.phase,
      groupCount: result.data.groups.length,
      submissionCount: result.data.submissions.length,
    };
    await mkdir(new URL('../../validation-results/', import.meta.url), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        status: 'CAPTURED',
        activityId,
        phase: evidence.phase,
        submissionCount: evidence.submissionCount,
        evidenceFile: 'validation-results/restart-evidence.json',
      }),
    );
  } else {
    const prior = JSON.parse(await readFile(evidencePath, 'utf8'));
    assert.match(prior.activityId, /^[0-9a-f-]{36}$/);
    assert.equal(prior.phase, 'active');
    assert.ok(prior.submissionCount > 0);
    assert.notEqual(session.data.bootId, prior.bootId, 'SERVER_HAS_NOT_RESTARTED');
    assert.equal(session.data.currentActivityId, null, 'REQUIRES_FRESH_SERVER_BEFORE_NEW_ACTIVITY');
    const stale = await subscribe(prior.activityId);
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'ACTIVITY_UNAVAILABLE');
    const createdResponse = await fetch(`${origin}/api/activities`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.data.csrfToken,
      },
      body: JSON.stringify({ groupCount: prior.groupCount }),
    });
    const created = await createdResponse.json();
    assert.equal(created.ok, true);
    const fresh = await subscribe(created.data.activityId);
    assert.equal(fresh.ok, true);
    assert.notEqual(fresh.data.activityId, prior.activityId);
    assert.equal(fresh.data.phase, 'waiting');
    assert.equal(fresh.data.submissions.length, 0);
    assert.ok(fresh.data.groups.every((group) => !group.occupied && group.name === ''));
    console.log(
      JSON.stringify({
        status: 'PASS',
        oldActivityRejected: true,
        newBootId: true,
        newActivityId: fresh.data.activityId,
        carriedBindings: 0,
        carriedNames: 0,
        carriedSubmissions: 0,
        limitation: 'OPERATOR_MUST_CONFIRM_FULL_COMPUTER_REBOOT_AND_TEST_NEW_SUBMISSION',
      }),
    );
  }
} catch {
  console.error('RESTART_ACCEPTANCE_CHECK_FAILED');
  process.exitCode = 1;
} finally {
  socket.disconnect();
}
