import { expect, test } from '@playwright/test';

test('serves separate teacher and student entry points', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000');
  await expect(page.getByRole('status')).toHaveText('老師控制台');
  await page.goto('http://127.0.0.1:3001/student/example');
  await expect(page.getByRole('status')).toHaveText('學生作答頁');
});
