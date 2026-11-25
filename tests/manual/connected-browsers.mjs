// Opt-in UI acceptance on a loaded real activity, using isolated Chrome and Edge profiles.
// Leaves the activity active with submissions, ready for the explicit computer-reboot test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { io } from 'socket.io-client';

const [activityId, studentOrigin] = process.argv.slice(2);
const completeActivity = process.argv[4] === '--complete';
assert.match(activityId ?? '', /^[0-9a-f-]{36}$/);
const studentUrl = new URL(studentOrigin);
assert.equal(studentUrl.protocol, 'http:');
assert.equal(studentUrl.port, '3001');
assert.equal(studentUrl.pathname, '/');
assert.equal(studentUrl.username + studentUrl.password + studentUrl.search + studentUrl.hash, '');
assert.ok(
  [
    '127.0.0.1',
    ...Object.values((await import('node:os')).networkInterfaces())
      .flat()
      .filter(Boolean)
      .map((entry) => entry.address),
  ].includes(studentUrl.hostname),
);
const origin = 'http://127.0.0.1:3000';
const response = await fetch(`${origin}/api/session`);
const cookie = response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const teacher = io(origin, {
  transports: ['websocket'],
  reconnection: false,
  extraHeaders: { Origin: origin, Cookie: cookie },
});
const browsers = [];
let stage = 'initial-snapshot';
async function command(event) {
  const reply = await teacher
    .timeout(3000)
    .emitWithAck(event, { activityId, requestId: randomUUID() });
  assert.equal(reply.ok, true, reply.error?.code);
  return reply.data;
}
try {
  await new Promise((resolve, reject) => {
    teacher.once('connect', resolve);
    teacher.once('connect_error', () => reject(new Error('CONNECTION_FAILED')));
  });
  const initial = await command('activity:subscribe');
  assert.equal(initial.phase, 'waiting');
  assert.equal(initial.sourceReady, true);
  assert.equal(initial.groups.length, 2);
  assert.ok(initial.groups.every((group) => !group.occupied));
  assert.equal(initial.questions[0].kind, 'single');
  stage = 'launch-browsers';
  const chrome = await chromium.launch({ channel: 'chrome', headless: true });
  browsers.push(chrome);
  const edge = await chromium.launch({ channel: 'msedge', headless: true });
  browsers.push(edge);
  const a = await chrome.newPage();
  const b = await edge.newPage();
  const packetsA = [];
  const packetsB = [];
  for (const [page, packets] of [
    [a, packetsA],
    [b, packetsB],
  ]) {
    page.on('websocket', (socket) =>
      socket.on('framereceived', (event) => packets.push(String(event.payload))),
    );
  }
  const link = `${studentUrl.origin}/student/${activityId}`;
  stage = 'navigate-student-pages';
  await Promise.all([a.goto(link), b.goto(link)]);
  stage = 'join-first-group';
  await a.getByRole('button', { name: '第 1 組', exact: true }).click();
  await expect(b.getByRole('button', { name: '第 1 組（已占用）', exact: true })).toBeDisabled();
  stage = 'join-second-group';
  await b.getByRole('button', { name: '第 2 組', exact: true }).click();
  stage = 'start-activity';
  await command('activity:start');
  await Promise.all(
    [a, b].map((page) =>
      expect(page.getByRole('heading', { name: '搶答進行中', exact: true })).toBeVisible({
        timeout: 2000,
      }),
    ),
  );
  const formA = a.getByRole('form', { name: '第 1 題', exact: true });
  const formB = b.getByRole('form', { name: '第 1 題', exact: true });
  stage = 'submit-answers';
  const progress = new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      teacher.off('teacher:progress', changed);
      reject(new Error('PROGRESS_SYNC_OVER_2_SECONDS'));
    }, 2000);
    function changed(event) {
      if (event.submissions.length > 0) {
        clearTimeout(deadline);
        teacher.off('teacher:progress', changed);
        resolve();
      }
    }
    teacher.on('teacher:progress', changed);
  });
  await formA.getByRole('textbox').fill('CPU');
  await formA.getByRole('button').click();
  await progress;
  await expect(formA.getByRole('button')).toHaveText('本組答案已受理');
  await expect(b.getByRole('region', { name: '公布結果', exact: true })).toHaveCount(0);
  await formB.getByRole('textbox').fill('中央處理器');
  await formB.getByRole('button').click();
  await expect(formB.getByRole('button')).toHaveText('本組答案已受理');
  const snapshot = await command('activity:subscribe');
  stage = 'verify-order-and-privacy';
  assert.equal(snapshot.submissions.length, 2);
  assert.deepEqual(
    snapshot.submissions.map((s) => s.sequence),
    [1, 2],
  );
  assert.equal(snapshot.tentativeResults[0].winnerGroup.ordinal, 1);
  for (const packets of [packetsA, packetsB])
    assert.ok(
      !packets.join('').match(/teacher:progress|"sequence"|"receivedAt"|"results"|"submissions"/),
    );
  await a.reload();
  stage = 'restore-first-group';
  await expect(
    a.getByRole('form', { name: '第 1 題', exact: true }).getByRole('button'),
  ).toHaveText('本組答案已受理');
  if (completeActivity) {
    stage = 'publish-results';
    await command('activity:end');
    await Promise.all(
      [a, b].map((page) =>
        expect(page.getByRole('heading', { name: '搶答已結束', exact: true })).toBeVisible({
          timeout: 2000,
        }),
      ),
    );
    for (const page of [a, b]) {
      const results = page.getByRole('region', { name: '公布結果', exact: true });
      await expect(results.getByText('搶答成功：第 1 組', { exact: true })).toBeVisible();
    }
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      browsers: ['Chrome', 'Edge'],
      activityId,
      anonymousGroups: 2,
      acceptedSubmissions: 2,
      firstWinner: 1,
      phaseSyncWithin2Seconds: true,
      teacherProgressWithin2Seconds: true,
      activePacketPrivacy: true,
      reloadRestoresGroup: true,
      phase: completeActivity ? 'ended' : 'active',
      endSyncWithin2Seconds: completeActivity || undefined,
      next: completeActivity ? 'ACCEPTANCE_COMPLETE' : 'CAPTURE_RESTART_EVIDENCE',
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', stage, errorType: error?.name ?? 'unknown' }));
  process.exitCode = 1;
} finally {
  for (const browser of browsers) await browser.close();
  teacher.disconnect();
}
