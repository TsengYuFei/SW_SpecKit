import { expect, test } from '@playwright/test';
import { uiClassroom } from '../helpers/ui-classroom';
import { clipboardState, installClipboard, settleClipboard } from '../helpers/clipboard';

for (const mode of ['resolve', 'pending', 'reject', 'missing'] as const) {
  test(`copies the exact visible activity URL with ${mode} clipboard`, async ({ browser }) => {
    const c = await uiClassroom();
    const context = await browser.newContext();
    try {
      await installClipboard(context, mode);
      const [name, value] = c.client.cookie.split('=');
      await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
      const page = await context.newPage();
      await page.goto(c.server.url);
      const panel = page.getByRole('region', { name: '活動控制', exact: true });
      const link = panel.locator('.join-link a');
      await expect(link).toBeVisible();
      const url = (await link.textContent())!;
      expect(await link.getAttribute('href')).toBe(url);
      const button = panel.getByRole('button', { name: '複製活動連結', exact: true });
      await button.click();
      if (mode === 'pending') {
        await expect(button).toBeDisabled();
        await expect(panel.getByText('已複製活動連結', { exact: true })).toHaveCount(0);
        await button.evaluate((element: HTMLButtonElement) => element.click());
        expect((await clipboardState(page)).writes).toEqual([url]);
        await settleClipboard(page);
      }
      if (mode === 'resolve' || mode === 'pending') {
        await expect(panel.getByRole('status').filter({ hasText: '已複製活動連結' })).toBeVisible({
          timeout: 1000,
        });
        if (mode === 'resolve') {
          await button.focus();
          await button.press('Enter');
          await expect.poll(async () => (await clipboardState(page)).writes.length).toBe(2);
          await button.press('Space');
          await expect.poll(async () => (await clipboardState(page)).writes.length).toBe(3);
        }
        expect((await clipboardState(page)).writes.every((value) => value === url)).toBe(true);
      } else {
        await expect(panel.getByRole('alert')).toContainText('請手動複製', { timeout: 1000 });
        const fallback = panel.getByLabel('手動複製活動連結', { exact: true });
        await expect(fallback).toHaveValue(url);
        await fallback.focus();
        expect(
          await fallback.evaluate(
            (input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!,
          ),
        ).toBe(url.length);
        await expect(panel.getByText('已複製活動連結', { exact: true })).toHaveCount(0);
      }
      expect((await clipboardState(page)).reads).toBe(0);
      expect((await clipboardState(page)).activation.every(Boolean)).toBe(true);
      if (mode === 'resolve' || mode === 'reject') {
        await panel.locator('.join-link').screenshot({
          path: `validation-results/feature-003-phase-5/copy-${mode}.png`,
        });
      }
    } finally {
      await context.close();
      await c.server.stop();
    }
  });
}
