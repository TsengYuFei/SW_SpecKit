import { expect, test } from '@playwright/test';
import { uiClassroom } from '../helpers/ui-classroom';

test('compares four groups across six questions with full 40-character names, live accepted answers and keyboard scrolling', async ({
  browser,
}) => {
  const c = await uiClassroom();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  try {
    const page = await context.newPage();
    await page.goto(c.server.url);
    const table = page.getByRole('table', { name: '各組作答狀況', exact: true });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('columnheader')).toHaveCount(9);
    const first = table.getByRole('row').nth(1),
      second = table.getByRole('row').nth(2);
    await expect(first.getByRole('rowheader')).toHaveText('第1組-' + c.longName);
    await expect(first).toContainText('尚未作答');
    await expect(table.getByRole('row').nth(4)).toContainText('尚未加入');
    c.answer(0, 0, '甲答案');
    c.answer(1, 0, '乙答案');
    c.answer(1, 1, '乙第二題');
    await expect(first.getByRole('cell').nth(2)).toContainText('搶答成功');
    await expect(second.getByRole('cell').nth(2)).toContainText('已受理');
    await expect(second.getByRole('cell').nth(3)).toContainText('搶答成功');
    await expect(second).toContainText('已提交 2 題');
    const fullName = first.getByRole('rowheader');
    expect(
      await fullName.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);
    await page.screenshot({ path: 'validation-results/feature-002-phase-7/teacher-desktop.png' });
    await table.screenshot({ path: 'validation-results/feature-002-phase-7/teacher-table.png' });
    await page.setViewportSize({ width: 640, height: 720 });
    const scrollArea = page.getByRole('region', { name: '各組作答狀況表格，可橫向捲動' });
    expect(await scrollArea.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await scrollArea.focus();
    await scrollArea.press('ArrowRight');
    await expect
      .poll(() => scrollArea.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: 'validation-results/feature-002-phase-7/teacher-narrow.png' });
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('keeps twelve question columns readable with horizontal scrolling at desktop width', async ({
  browser,
}) => {
  const c = await uiClassroom(true, 12);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  try {
    const page = await context.newPage();
    await page.goto(c.server.url);
    const table = page.getByRole('table', { name: '各組作答狀況', exact: true });
    await expect(table.getByRole('columnheader')).toHaveCount(15);
    const scrollArea = page.getByRole('region', { name: '各組作答狀況表格，可橫向捲動' });
    expect(await scrollArea.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    const lastHeader = table.getByRole('columnheader').last();
    expect(
      await lastHeader.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(100);
    await scrollArea.focus();
    await scrollArea.press('ArrowRight');
    await expect
      .poll(() => scrollArea.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  } finally {
    await context.close();
    await c.server.stop();
  }
});
