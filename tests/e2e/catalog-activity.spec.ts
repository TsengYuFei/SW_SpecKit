import { expect, test } from '@playwright/test';
import { catalogServer } from '../helpers/catalog-server.js';

test('catalog exposes read-only and empty-search states without requiring a URL', async ({
  page,
}) => {
  const server = await catalogServer();
  try {
    await page.goto(server.url);
    await page.getByRole('button', { name: '授權 Google Sheets' }).click();
    await expect(page.getByRole('button', { name: '預覽 教材二（source-two）' })).toBeDisabled();
    await expect(page.getByLabel('Google Sheets URL 或 Spreadsheet ID')).toHaveCount(0);
    await page.getByLabel('搜尋試算表').fill('不存在的教材');
    await page.getByRole('button', { name: '搜尋教材' }).click();
    await expect(page.getByText('目前沒有符合搜尋條件的試算表。')).toBeVisible();
  } finally {
    await server.stop();
  }
});
