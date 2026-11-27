import { expect, test } from '@playwright/test';
import { catalogClassroom } from '../helpers/activity';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer';
import { randomUUID } from 'node:crypto';
test('restores saved settings and history after reload and page reopening, clears the previous account, and reads snapshots without Google', async ({
  browser,
}) => {
  const c = await catalogClassroom();
  executeCommand(c.store, c.a, 'group:join', {
    activityId: c.activity.id,
    requestId: randomUUID(),
    groupId: c.groups[0]!.id,
    name: '帳號A專用',
  });
  const context = await browser.newContext(),
    cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  try {
    let page = await context.newPage();
    await page.goto(c.server.url);
    await page.getByLabel('預設參與組數').fill('4');
    await page.getByRole('button', { name: '保存老師設定' }).click();
    await expect(page.getByText('老師設定已保存。', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('預設參與組數')).toHaveValue('4');
    await page.close();
    page = await context.newPage();
    await page.goto(c.server.url);
    await expect(page.getByLabel('預設參與組數')).toHaveValue('4');
    c.server.gateway.readFirstSheet = async () => {
      throw new Error('saved snapshots must not read Google');
    };
    await page
      .getByRole('region', { name: '歷史活動', exact: true })
      .getByRole('button', { name: /查看 教材一/ })
      .click();
    const joinedGroup = page
      .getByRole('region', { name: '歷史活動詳情' })
      .getByRole('table', { name: '各組作答狀況', exact: true })
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: '第1組-帳號A專用', exact: true }) });
    await expect(joinedGroup).toBeVisible();
    await expect(joinedGroup).toContainText('已加入');
    await c.client.connect('owner-b');
    await expect(page.getByText('目前沒有已保存活動。', { exact: true })).toBeVisible();
    await expect(page.getByText(/第1組-帳號A專用/)).toHaveCount(0);
    await expect(page.getByLabel('預設參與組數')).toHaveValue('2');
    await c.client.connect('owner-a');
    await expect(page.getByLabel('預設參與組數')).toHaveValue('4');
    await expect(
      page
        .getByRole('region', { name: '歷史活動', exact: true })
        .getByRole('button', { name: /查看 教材一/ }),
    ).toBeVisible();
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('clears old teacher history after a runtime restart and restores it only after original-account authorization', async ({
  browser,
}) => {
  const { catalogServer } = await import('../helpers/catalog-server');
  const { createPersistenceFixture } = await import('../helpers/persistence');
  const c = await catalogClassroom(),
    context = await browser.newContext(),
    cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  let replacement: Awaited<ReturnType<typeof catalogServer>> | undefined;
  try {
    const page = await context.newPage();
    await page.goto(c.server.url);
    await expect(page.getByRole('region', { name: '歷史活動', exact: true })).toBeVisible();
    await c.server.stop(true);
    replacement = await catalogServer(
      'teacher',
      createPersistenceFixture(c.server.persistence.directory),
      {
        teacher: Number(new URL(c.server.url).port),
        student: Number(new URL(c.server.studentUrl).port),
      },
    );
    await expect(page.getByRole('region', { name: '歷史活動', exact: true })).toHaveCount(0, {
      timeout: 10000,
    });
    await page.getByRole('button', { name: '授權 Google Sheets', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: '歷史活動', exact: true })
        .getByRole('button', { name: /查看 教材一/ }),
    ).toBeVisible();
  } finally {
    await context.close();
    if (replacement) await replacement.stop();
    else await c.server.stop();
  }
});
