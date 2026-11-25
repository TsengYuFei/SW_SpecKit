import { expect, test } from '@playwright/test';
import { automaticFixture } from '../helpers/automatic-writeback';
import { deferred } from '../helpers/google-adapter';
test('continues automatic writeback after the teacher closes the page and restores its durable status', async ({
  browser,
}) => {
  const c = await automaticFixture(),
    gate = deferred<void>(),
    entered = deferred<void>(),
    write = c.server.gateway.write;
  c.server.gateway.write = async (...args) => {
    entered.resolve();
    await gate.promise;
    await write(...args);
  };
  c.answer();
  const context = await browser.newContext(),
    cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  try {
    const page = await context.newPage();
    await page.goto(c.server.url);
    await expect(
      page.getByText(
        '結束後會自動回填成功答案，請先暫停從其他視窗編輯原試算表；無須再按回填按鈕。',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: '結束搶答並自動回填', exact: true }).click();
    await entered.promise;
    await page.close();
    gate.resolve();
    await c.server.worker!.drain();
    const restored = await context.newPage();
    await restored.goto(c.server.url);
    await expect(restored.getByText('回填狀態：讀回已確認', { exact: true })).toBeVisible();
    await expect(
      restored.getByRole('button', { name: '將成功答案回寫至原 Google Sheets' }),
    ).toHaveCount(0);
    expect(c.writes).toHaveLength(1);
  } finally {
    gate.resolve();
    await context.close();
    await c.server.stop();
  }
});
