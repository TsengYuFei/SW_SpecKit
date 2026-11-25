import { expect, test } from '@playwright/test';
import { classroomServer } from '../helpers/classroom-server';

test('requires immutable names, hides waiting packets and reveals questions to two browsers within two seconds', async ({
  browser,
}) => {
  const c = await classroomServer();
  const teacherContext = await browser.newContext(),
    aContext = await browser.newContext(),
    bContext = await browser.newContext();
  try {
    const cookie = c.client.cookie.split('=');
    await teacherContext.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.teacherUrl }]);
    const teacher = await teacherContext.newPage(),
      a = await aContext.newPage(),
      b = await bContext.newPage();
    const waitingPackets: string[] = [];
    a.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => waitingPackets.push(String(frame.payload))),
    );
    await teacher.goto(c.teacherUrl);
    await a.goto(c.studentUrl + '/student/' + c.activity.id);
    await b.goto(c.studentUrl + '/student/' + c.activity.id);
    await a.getByRole('button', { name: '第1組', exact: true }).click();
    await expect(a.getByRole('alert')).toContainText('請填寫');
    expect(c.server.persistence.activities.groups(c.activity.id)[0]!.participantId).toBeNull();
    const longName = '<長名>'.repeat(10);
    await a.getByLabel('組別名稱（1–40 字）').fill(longName);
    await a.getByRole('button', { name: '第1組', exact: true }).click();
    await expect(a.getByRole('heading', { name: '第1組-' + longName, exact: true })).toBeVisible();
    await expect(a.getByLabel('組別名稱（1–40 字）')).toHaveCount(0);
    await b.getByLabel('組別名稱（1–40 字）').fill('另一組');
    await b.getByRole('button', { name: '第2組', exact: true }).click();
    await a.reload();
    await expect(a.getByRole('heading', { name: '第1組-' + longName, exact: true })).toBeVisible();
    await expect(a.locator('textarea')).toHaveCount(0);
    await expect(b.locator('textarea')).toHaveCount(0);
    expect(waitingPackets.join('')).not.toContain(c.question.id);
    expect(waitingPackets.join('')).not.toContain('第一個小題');
    expect(waitingPackets.join('')).not.toContain('baseline');
    const opened = Date.now();
    await teacher.getByRole('button', { name: '開始搶答' }).click();
    await Promise.all([
      expect(a.locator('textarea').first()).toBeVisible({ timeout: 2000 }),
      expect(b.locator('textarea').first()).toBeVisible({ timeout: 2000 }),
    ]);
    expect(Date.now() - opened).toBeLessThanOrEqual(2000);
    const row = teacher
      .getByRole('table', { name: '各組作答狀況', exact: true })
      .getByRole('row')
      .nth(1);
    await expect(row.getByRole('rowheader')).toHaveText('第1組-' + longName);
    await expect(row).toContainText('已加入');
    await expect(row).toContainText('已提交 0 題');
  } finally {
    await Promise.all([teacherContext.close(), aContext.close(), bContext.close()]);
    await c.stop();
  }
});
