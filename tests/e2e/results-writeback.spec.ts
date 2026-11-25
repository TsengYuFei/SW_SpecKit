import { expect, test } from '@playwright/test';
import { catalogWritebackFixture } from '../helpers/writeback';
import { AppError } from '../../backend/src/security/safe-errors';

test('publishes the same results to both roles and verifies exact grouped writeback after pending', async ({
  browser,
}) => {
  const c = await catalogWritebackFixture();
  const originalWrite = c.gateway.write;
  c.gateway.write = async (...args) => {
    await originalWrite(...args);
    throw new AppError('NETWORK_ERROR');
  };
  const teacherUrl = c.server.url;
  const context = await browser.newContext();
  const cookieParts = c.client.cookie.split('=');
  await context.addCookies([{ name: cookieParts[0]!, value: cookieParts[1]!, url: teacherUrl }]);
  await context.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  );
  const studentContext = await browser.newContext();
  try {
    const page = await context.newPage();
    const pupil = await studentContext.newPage();
    await page.goto(teacherUrl);
    await pupil.goto(`${c.server.studentUrl}/student/${c.activity.id}`);
    for (const view of [page, pupil]) {
      const results = view.getByRole('region', { name: '公布結果', exact: true });
      await expect(results.getByText('搶答成功：第 1 組', { exact: true })).toBeVisible();
      await expect(results.getByText('無成功組', { exact: true })).toBeVisible();
      await expect(results.getByText(/=SUM\(A1\)/)).toBeVisible();
    }
    await page.getByRole('button', { name: '將成功答案回寫至原 Google Sheets' }).click();
    await expect(page.getByText('回寫狀態：待確認', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
    await expect(page.getByRole('button', { name: '確認題目並建立活動' })).toBeDisabled();
    await expect(pupil.getByRole('region', { name: '回寫線上教材' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('回寫狀態：待確認', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
    await page.getByRole('button', { name: '查核並安全重試' }).click();
    await expect(page.getByText('回寫狀態：讀回已確認', { exact: true })).toBeVisible();
    expect(c.writes).toHaveLength(1);
    await expect(page.getByRole('button', { name: '確認題目並建立活動' })).toBeEnabled();
    expect(c.grid[0]!.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
    expect(c.grid[0]!.rows[2]![4]!.userEnteredValue).toEqual({ stringValue: '安全答案' });
  } finally {
    await context.close();
    await studentContext.close();
    await c.server.stop();
  }
});
