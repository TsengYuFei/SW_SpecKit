import { expect, test } from '@playwright/test';
import { resultExportFixture } from '../helpers/result-export';
import { uiClassroom } from '../helpers/ui-classroom';

test('distinguishes crossed global receipts from dense question ranks and agrees with grouped CSV rows', async ({
  browser,
}) => {
  const c = await resultExportFixture();
  const context = await browser.newContext();
  try {
    c.server.catalog!.restoreCurrent();
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    const panel = page
      .getByRole('region', { name: '活動控制', exact: true })
      .getByRole('region', { name: '已受理答案', exact: true });
    const rows = panel.getByRole('row');
    await expect(rows).toHaveCount(5);
    for (let i = 1; i <= 4; i++) await expect(rows.nth(i)).toContainText(`全場 ${i}`);
    await expect(rows.nth(1)).toContainText('本題第 1 名');
    await expect(rows.nth(3)).toContainText('本題第 2 名');
    await expect(rows.nth(1)).toContainText('H₂O');
    await expect(rows.nth(1)).toContainText('100°C');
    await panel.screenshot({
      path: 'validation-results/feature-003-phase-4/answer-order-global.png',
    });
    const question = panel.getByRole('button', { name: '依題目', exact: true });
    await question.focus();
    await question.press('Enter');
    await expect(question).toHaveAttribute('aria-pressed', 'true');
    const snapshot = c.snapshot(c.histories[0]!);
    await panel.getByLabel('選擇題目', { exact: true }).selectOption(snapshot.questions[0]!.id);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1).getByRole('rowheader')).toHaveText('第2組-乙組');
    await expect(rows.nth(2)).toContainText('全場 4');
    await expect(panel.getByText('第3組 — 未作答', { exact: true })).toBeVisible();
    await panel.getByLabel('選擇題目', { exact: true }).selectOption(snapshot.questions[1]!.id);
    await expect(rows.nth(1).getByRole('rowheader')).toHaveText('第1組-甲組');
    await expect(rows.nth(1)).toContainText('水的化學式？');
    await expect(rows.nth(1)).toContainText('水的沸點？');
    await panel.screenshot({
      path: 'validation-results/feature-003-phase-4/answer-order-question.png',
    });
    const csv = await (
      await fetch(c.server.url + `/api/activities/${c.histories[0]}/export.csv`, {
        headers: c.client.headers,
      })
    ).text();
    expect(csv).toContain('"1","","3+4？","第2組-乙組","7"');
    expect(csv).toContain('"2","1","水的化學式？","第1組-甲組","H₂O"');
  } finally {
    await context.close();
    await c.close();
  }
});

test('keeps full 40-unit names and multiline answers readable with keyboard controls and empty states', async ({
  browser,
}) => {
  const c = await uiClassroom(true),
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    const panel = page
      .getByRole('region', { name: '活動控制', exact: true })
      .getByRole('region', { name: '已受理答案', exact: true });
    await expect(panel.getByText('尚無已受理答案。', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '依題目', exact: true }).press('Space');
    await expect(panel.getByText('第4組 — 未作答', { exact: true })).toBeVisible();
    const answer = '長答案<&>\n' + '完整內容'.repeat(100);
    c.answer(0, 0, answer);
    await expect(
      panel.getByRole('rowheader', { name: '第1組-' + c.longName, exact: true }),
    ).toBeVisible({ timeout: 2000 });
    await expect(panel.getByText(answer, { exact: true })).toBeVisible();
    const scroll = panel.getByRole('region', { name: '收件順位表格，可橫向捲動', exact: true });
    await scroll.focus();
    await expect(scroll).toBeFocused();
    expect(
      await panel
        .getByText(answer, { exact: true })
        .evaluate((node) => getComputedStyle(node).whiteSpace),
    ).toBe('pre-wrap');
    await panel.getByRole('button', { name: '全部收件', exact: true }).press('Enter');
    c.answer(1, 0, '另一組答案');
    await expect(panel.getByRole('row').nth(2)).toContainText('本題第 2 名', { timeout: 2000 });
    await panel.getByRole('button', { name: '依題目', exact: true }).click();
    await panel.getByLabel('選擇題目', { exact: true }).selectOption(c.activity.questions[1]!.id);
    await expect(panel.getByText('尚無已受理答案。', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('contains malformed history answer data within the answer panel', async ({ browser }) => {
  const c = await resultExportFixture(),
    context = await browser.newContext();
  try {
    const id = c.histories[0]!,
      envelope = await (await c.client.get('/api/activities/' + id)).json();
    delete envelope.data.snapshot.submissions;
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    await context.route('**/api/activities/' + id, (route) => route.fulfill({ json: envelope }));
    const page = await context.newPage();
    await page.goto(c.server.url);
    await page.getByRole('button', { name: /^查看 合成教材/ }).click();
    const detail = page.getByRole('region', { name: '歷史活動詳情', exact: true });
    await expect(
      detail.getByRole('region', { name: '已受理答案', exact: true }).getByRole('alert'),
    ).toContainText('作答紀錄無法完整顯示');
    await expect(detail.getByRole('region', { name: '公布結果', exact: true })).toBeVisible();
    await expect(detail.getByRole('button', { name: '下載本場 CSV', exact: true })).toBeEnabled();
  } finally {
    await context.close();
    await c.close();
  }
});
