import { expect, test } from '@playwright/test';
import { classroomServer } from '../helpers/classroom-server';
import { createStore } from '../../backend/src/activity/store';
import { createSessions } from '../../backend/src/security/sessions';
import { createListener } from '../../backend/src/server';
import { readConfig } from '../../backend/src/config';
import { close } from '../helpers/server';

test('two browser identities submit complete groups privately, recover tabs, and synchronize in two seconds', async ({
  browser,
}) => {
  const c = await classroomServer();
  const teacherContext = await browser.newContext();
  const aContext = await browser.newContext();
  await aContext.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  );
  const bContext = await browser.newContext();
  try {
    const teacher = await teacherContext.newPage();
    const a = await aContext.newPage();
    const b = await bContext.newPage();
    await teacher.goto(c.teacherUrl);
    await a.goto(`${c.studentUrl}/student/${c.activity.id}`);
    await b.goto(`${c.studentUrl}/student/${c.activity.id}`);
    await a.getByRole('button', { name: '第 1 組', exact: true }).click();
    await expect(b.getByRole('button', { name: '第 1 組（已占用）', exact: true })).toBeDisabled({
      timeout: 2000,
    });
    await b.getByRole('button', { name: '第 2 組', exact: true }).click();
    await a.getByLabel('組別名稱（1–40 字）').fill('咕咕嘎嘎');
    await a.getByRole('button', { name: '儲存組名' }).click();
    await expect(a.getByRole('heading', { name: '第 1 組－咕咕嘎嘎', exact: true })).toBeVisible();
    await teacher.getByRole('button', { name: '開始搶答' }).click();
    await expect(a.getByRole('heading', { name: '搶答進行中' })).toBeVisible({ timeout: 2000 });
    await expect(b.getByRole('heading', { name: '搶答進行中' })).toBeVisible({ timeout: 2000 });
    const aForm = a.getByRole('form', { name: '第 1 題', exact: true });
    await aForm.getByRole('textbox').nth(0).fill('第一組的秘密答案 A');
    await expect(aForm.getByRole('button')).toBeDisabled();
    await aForm.getByRole('textbox').nth(1).fill('第一組的秘密答案 B');
    await aForm.getByRole('button').click();
    await expect(aForm.getByRole('button')).toHaveText('本組答案已受理');
    await aContext.setOffline(true);
    await expect(a.getByText('連線中斷，等待重新連線…', { exact: true })).toBeVisible();
    await aContext.setOffline(false);
    await expect(a.getByText('即時連線已建立', { exact: true })).toBeVisible();
    await expect(aForm.getByRole('button')).toHaveText('本組答案已受理');
    await expect(b.getByText('第一組的秘密答案 A')).toHaveCount(0);
    const bForm = b.getByRole('form', { name: '第 1 題', exact: true });
    await bForm.getByRole('textbox').nth(0).fill('第二組答案 A');
    await bForm.getByRole('textbox').nth(1).fill('第二組答案 B');
    await bForm.getByRole('button').click();
    await expect(bForm.getByRole('button')).toHaveText('本組答案已受理');
    await teacher.reload();
    await expect(teacher.getByRole('button', { name: '結束搶答' })).toBeEnabled();
    const tab = await aContext.newPage();
    await tab.goto(`${c.studentUrl}/student/${c.activity.id}`);
    await expect(
      tab.getByRole('form', { name: '第 1 題', exact: true }).getByRole('button'),
    ).toHaveText('本組答案已受理');
    await aContext.clearCookies();
    await a.reload();
    await expect(a.getByRole('button', { name: /第 1 組.*已占用/ })).toBeDisabled();
    await teacher.getByRole('button', { name: '結束搶答' }).click();
    await expect(b.getByRole('heading', { name: '搶答已結束', exact: true })).toBeVisible({
      timeout: 2000,
    });
    await b.reload();
    await expect(b.getByRole('heading', { name: '搶答已結束', exact: true })).toBeVisible();
  } finally {
    await Promise.all([teacherContext.close(), aContext.close(), bContext.close()]);
    await c.stop();
  }
});

test('a new process store rejects an old activity instead of resuming its browser binding', async ({
  page,
}) => {
  const c = await classroomServer();
  await page.goto(`${c.studentUrl}/student/${c.activity.id}`);
  await page.getByRole('button', { name: '第 1 組', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第 1 組', exact: true })).toBeVisible();
  await c.stop();
  const replacement = createListener('student', createStore(10), createSessions(), readConfig({}));
  await new Promise<void>((resolve) =>
    replacement.server.listen(Number(new URL(c.studentUrl).port), '127.0.0.1', resolve),
  );
  try {
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('活動已不可用');
    await expect(page.getByRole('heading', { name: '第 1 組', exact: true })).toHaveCount(0);
  } finally {
    replacement.io.disconnectSockets(true);
    await close(replacement.server);
  }
});
