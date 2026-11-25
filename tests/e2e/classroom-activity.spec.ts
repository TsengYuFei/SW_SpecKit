import { catalogServer } from '../helpers/catalog-server';
import { createPersistenceFixture } from '../helpers/persistence';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { classroomServer } from '../helpers/classroom-server';

test('two browser identities submit complete groups privately, recover tabs, and synchronize in two seconds', async ({
  browser,
}) => {
  const c = await classroomServer();
  const teacherContext = await browser.newContext();
  const cookieParts = c.client.cookie.split('=');
  await teacherContext.addCookies([
    { name: cookieParts[0]!, value: cookieParts[1]!, url: c.teacherUrl },
  ]);
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
    await a.getByLabel('組別名稱（1–40 字）').fill('咕咕嘎嘎');
    await a.getByRole('button', { name: '第1組', exact: true }).click();
    await expect(b.getByRole('button', { name: '第1組（已占用）', exact: true })).toBeDisabled({
      timeout: 2000,
    });
    await b.getByLabel('組別名稱（1–40 字）').fill('第二組');
    await b.getByRole('button', { name: '第2組', exact: true }).click();
    await expect(a.getByRole('heading', { name: '第1組-咕咕嘎嘎', exact: true })).toBeVisible();
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
    await expect(a.getByRole('button', { name: /第1組.*已占用/ })).toBeDisabled();
    await teacher.getByRole('button', { name: '結束搶答' }).click();
    await expect(b.getByRole('heading', { name: '搶答已結束', exact: true })).toBeVisible({
      timeout: 2000,
    });
    await expect(teacher.getByText('回填狀態：讀回已確認', { exact: true })).toBeVisible();
    await b.reload();
    await expect(b.getByRole('heading', { name: '搶答已結束', exact: true })).toBeVisible();
  } finally {
    await Promise.all([teacherContext.close(), aContext.close(), bContext.close()]);
    await c.stop();
  }
});

test('retains the original browser binding and active phase across a fresh runtime', async ({
  page,
}) => {
  const c = await classroomServer();
  let replacement: Awaited<ReturnType<typeof catalogServer>> | undefined;
  const directory = c.server.persistence.directory;
  try {
    await page.goto(c.studentUrl + '/student/' + c.activity.id);
    await page.getByLabel('組別名稱（1–40 字）').fill('原組名');
    await page.getByRole('button', { name: '第1組', exact: true }).click();
    await expect(page.getByRole('heading', { name: '第1組-原組名', exact: true })).toBeVisible();
    executeCommand(c.store, c.teacher, 'activity:start', {
      activityId: c.activity.id,
      requestId: randomUUID(),
    });
    const port = Number(new URL(c.studentUrl).port);
    await c.server.stop(true);
    replacement = await catalogServer('teacher', createPersistenceFixture(directory), {
      student: port,
    });
    await expect(page.getByRole('heading', { name: '搶答進行中', exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('heading', { name: '第1組-原組名', exact: true })).toBeVisible();
    expect(replacement.persistence.activities.current()!.phase).toBe('active');
    const form = page.getByRole('form', { name: '第 1 題', exact: true });
    await form.getByRole('textbox').nth(0).fill('重啟後答案一');
    await form.getByRole('textbox').nth(1).fill('重啟後答案二');
    await form.getByRole('button').click();
    await expect(form.getByRole('button')).toHaveText('本組答案已受理');
  } finally {
    if (replacement) await replacement.stop();
    else await c.stop();
  }
});
