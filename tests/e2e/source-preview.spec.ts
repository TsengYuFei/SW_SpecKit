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

test('authorizes, reads grouped notes and restores the preview after reload', async ({ page }) => {
  await page.goto(server.url);
  await page.getByRole('button', { name: '授權 Google Sheets' }).click();
  await expect(page.getByRole('button', { name: '重新授權 Google' })).toBeVisible();
  await page.getByRole('button', { name: '建立活動' }).click();
  await page.getByLabel('Google Sheets URL 或 Spreadsheet ID').fill('https://evil.invalid');
  await page.getByRole('button', { name: '讀取線上題目' }).click();
  await expect(page.getByRole('alert')).toContainText('輸入無效');
  await page.getByLabel('Google Sheets URL 或 Spreadsheet ID').fill('example_sheet');
  await page.getByRole('button', { name: '讀取線上題目' }).click();
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: '確認題目及填空對應' }).click();
  await expect(page.getByRole('button', { name: '對應已確認' })).toBeDisabled();
  await page.reload();
  await expect(page.locator('article')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '對應已確認' })).toBeDisabled();
  server.gateway.read = async () => {
    throw new AppError('NETWORK_ERROR');
  };
  await page.getByLabel('Google Sheets URL 或 Spreadsheet ID').fill('example_sheet');
  await page.getByRole('button', { name: '讀取線上題目' }).click();
  await expect(page.getByRole('alert')).toContainText('連線中斷');
  await expect(page.locator('article')).toHaveCount(0);
});
