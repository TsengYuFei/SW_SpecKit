import { expect, test } from '@playwright/test';
import { catalogWritebackFixture } from '../helpers/writeback';
import { AppError } from '../../backend/src/security/safe-errors';
test('publishes the same results and safely verifies pending automatic writeback without a second write', async ({
  browser,
}) => {
  const c = await catalogWritebackFixture(),
    write = c.gateway.write,
    read = c.gateway.readSheetById!;
  c.gateway.write = async (...args) => {
    await write(...args);
    c.gateway.readSheetById = async () => {
      throw new AppError('NETWORK_ERROR');
    };
  };
  c.end();
  await c.server.worker!.drain();
  const context = await browser.newContext(),
    studentContext = await browser.newContext();
  const cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  await context.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  );
  try {
    const page = await context.newPage(),
      pupil = await studentContext.newPage();
    await page.goto(c.server.url);
    await pupil.goto(c.server.studentUrl + '/student/' + c.activity.id);
    for (const view of [page, pupil]) {
      const results = view.getByRole('region', { name: '公布結果', exact: true });
      await expect(results.getByText('搶答成功：第1組-測試組', { exact: true })).toBeVisible();
      await expect(results.getByText('無成功組', { exact: true })).toBeVisible();
      await expect(results.getByText(/=SUM\(A1\)/)).toBeVisible();
    }
    await expect(
      page.getByRole('button', { name: '將成功答案回寫至原 Google Sheets' }),
    ).toHaveCount(0);
    await expect(page.getByText('回填狀態：待確認', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
    await expect(page.getByRole('button', { name: '確認題目並建立活動' })).toBeDisabled();
    await expect(pupil.getByRole('region', { name: '回寫線上教材' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('回填狀態：待確認', { exact: true })).toBeVisible();
    c.gateway.readSheetById = read;
    await page.getByRole('button', { name: '查核原表' }).click();
    await expect(page.getByText('回填狀態：讀回已確認', { exact: true })).toBeVisible();
    expect(c.writes).toHaveLength(1);
    await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
    await expect(page.getByRole('button', { name: '確認題目並建立活動' })).toBeEnabled();
    expect(c.grid[0]!.rows[1]![4]!.userEnteredValue).toEqual({ stringValue: '=SUM(A1)' });
  } finally {
    await context.close();
    await studentContext.close();
    await c.server.stop();
  }
});
