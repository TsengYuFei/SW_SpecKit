import { expect, test } from '@playwright/test';
import { sourceServer } from '../helpers/source-server.js';
import { AppError } from '../../backend/src/security/safe-errors.js';

let server: Awaited<ReturnType<typeof sourceServer>>;
test.beforeAll(async () => {
  server = await sourceServer();
});
test.afterAll(async () => {
  await server.stop();
});

test('authorizes, previews the first worksheet and restores the created source after reload', async ({
  page,
}) => {
  await page.goto(server.url);
  await page.getByRole('button', { name: '授權 Google Sheets' }).click();
  await expect(page.getByRole('button', { name: '重新授權 Google' })).toBeVisible();
  await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await page.getByRole('button', { name: '確認題目並建立活動' }).click();
  await expect(page.getByText('已建立活動，共 2 組，教材已確認。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('已建立活動，共 2 組，教材已確認。')).toBeVisible();
  server.gateway.readFirstSheet = async () => {
    throw new AppError('NETWORK_ERROR');
  };
  await page.getByRole('button', { name: '預覽 教材一（source-one）' }).click();
  await expect(page.getByRole('alert')).toContainText('連線中斷');
  await expect(page.locator('article')).toHaveCount(0);
  expect(server.persistence.activities.current()?.phase).toBe('waiting');
});
