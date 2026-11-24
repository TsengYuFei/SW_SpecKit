import { expect, test } from '@playwright/test';
import { writebackFixture } from '../helpers/writeback';
import { createListener } from '../../backend/src/server';
import { createOAuth } from '../../backend/src/google/oauth';
import { googleRoutes } from '../../backend/src/http/google-routes';
import { activityRoutes } from '../../backend/src/http/activity-routes';
import { writebackRoutes } from '../../backend/src/http/writeback-routes';
import { readConfig } from '../../backend/src/config';
import { close, listen } from '../helpers/server';
import { AppError } from '../../backend/src/security/safe-errors';

test('publishes the same results to both roles and verifies exact grouped writeback after pending', async ({
  browser,
}) => {
  const c = writebackFixture();
  const originalWrite = c.gateway.write;
  c.gateway.write = async (...args) => {
    await originalWrite(...args);
    throw new AppError('NETWORK_ERROR');
  };
  const config = readConfig({});
  const student = createListener('student', c.store, c.sessions, config);
  config.STUDENT_PUBLIC_ORIGIN = await listen(student.server);
  const teacher = createListener('teacher', c.store, c.sessions, config, {
    registerRoutes(app, ctx) {
      googleRoutes(app, ctx, createOAuth(c.gateway));
      activityRoutes(app, ctx);
      writebackRoutes(app, ctx, c.service);
    },
  });
  const teacherUrl = await listen(teacher.server);
  const context = await browser.newContext();
  const studentContext = await browser.newContext();
  try {
    const page = await context.newPage();
    const pupil = await studentContext.newPage();
    await page.goto(teacherUrl);
    await pupil.goto(`${config.STUDENT_PUBLIC_ORIGIN}/student/${c.activity.id}`);
    for (const view of [page, pupil]) {
      const results = view.getByRole('region', { name: '公布結果', exact: true });
      await expect(results.getByText('搶答成功：第 1 組', { exact: true })).toBeVisible();
      await expect(results.getByText('無成功組', { exact: true })).toBeVisible();
      await expect(results.getByText(/=SUM\(A1\)/)).toBeVisible();
    }
    await page.getByRole('button', { name: '將成功答案回寫至原 Google Sheets' }).click();
    await expect(page.getByText('回寫狀態：待確認', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '建立下一場活動' })).toBeDisabled();
    await expect(pupil.getByRole('region', { name: '回寫線上教材' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('回寫狀態：待確認', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查核並安全重試' }).click();
    await expect(page.getByText('回寫狀態：讀回已確認', { exact: true })).toBeVisible();
    expect(c.writes).toHaveLength(1);
    await expect(page.getByRole('button', { name: '建立下一場活動' })).toBeEnabled();
    expect(c.grid[0]!.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
    expect(c.grid[0]!.rows[2]![4]!.userEnteredValue).toEqual({ stringValue: '安全答案' });
  } finally {
    await context.close();
    await studentContext.close();
    teacher.io.disconnectSockets(true);
    student.io.disconnectSockets(true);
    await close(teacher.server);
    await close(student.server);
  }
});
