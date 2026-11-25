import { expect, test } from '@playwright/test';

test('serves separate teacher and student entry points', async ({ page }) => {
  await page.goto('http://127.0.0.1:3010');
  await expect(page.getByRole('status').filter({ hasText: /^老師控制台$/ })).toBeVisible();
  await page.goto('http://127.0.0.1:3011/student/example');
  await expect(page.getByRole('status').filter({ hasText: /^學生作答頁$/ })).toBeVisible();
});
