import { expect, test } from '@playwright/test';
import { catalogServer } from '../helpers/catalog-server';
import { automaticFixture } from '../helpers/automatic-writeback';
import { uiClassroom } from '../helpers/ui-classroom';
import { deferred } from '../helpers/google-adapter';

test('explains authorization, loading and empty catalog states and offers keyboard navigation', async ({
  browser,
}) => {
  const c = await catalogServer(),
    context = await browser.newContext();
  const gate = deferred<void>();
  try {
    const page = await context.newPage();
    await page.goto(c.url);
    await expect(
      page.getByText('請先連結 Google 帳號，選擇教材或查看自己的歷史活動。', { exact: true }),
    ).toBeVisible();
    const navigation = page.getByRole('navigation', { name: '老師導覽' });
    await expect(navigation.getByRole('link', { name: '選擇教材', exact: true })).toBeVisible();
    c.gateway.listSpreadsheets = async () => {
      await gate.promise;
      return { items: [], nextPageToken: null, incompleteSearch: false };
    };
    await page.getByRole('button', { name: '授權 Google Sheets', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '正在處理，請稍候…' })).toBeVisible();
    gate.resolve();
    await expect(page.getByText('目前沒有符合搜尋條件的試算表。', { exact: true })).toBeVisible();
    const history = navigation.getByRole('link', { name: '歷史活動', exact: true });
    await history.focus();
    await history.press('Enter');
    await expect(page).toHaveURL(/#history$/);
    await expect(page.getByText('目前沒有已保存活動。', { exact: true })).toBeVisible();
  } finally {
    gate.resolve();
    await context.close();
    await c.stop();
  }
});

const guidance = {
  writing: '正在回填，請保留本機服務運作。',
  pending: '回填結果尚未確認，請先查核原表。',
  failed: '回填未完成，可先查核原表，再安全重試。',
  conflict: '來源內容已改變，請先核對教材；系統不會直接覆寫。',
  verified: '成功答案已回填並讀回確認。',
} as const;
for (const status of Object.keys(guidance) as (keyof typeof guidance)[]) {
  test(`explains ${status} writeback and exposes only valid recovery operations`, async ({
    browser,
  }) => {
    const c = await automaticFixture(),
      context = await browser.newContext();
    c.answer();
    c.end();
    await c.server.worker!.drain();
    const operation = (
      await (await c.client.get('/api/activities/' + c.activity.id + '/writeback')).json()
    ).data;
    operation.status = status;
    operation.questions = operation.questions.map((question: Record<string, unknown>) => ({
      ...question,
      status,
    }));
    const cookie = c.client.cookie.split('=');
    await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
    await context.route('**/api/activities/*/writeback', (route) =>
      route.fulfill({ json: { ok: true, data: operation, revision: 0 } }),
    );
    try {
      const page = await context.newPage();
      await page.goto(c.server.url);
      const panel = page.getByRole('region', { name: '回寫線上教材', exact: true });
      await expect(panel.getByText(guidance[status], { exact: true })).toBeVisible();
      await expect(panel.getByRole('button', { name: '安全重試回填', exact: true })).toHaveCount(
        status === 'pending' || status === 'failed' ? 1 : 0,
      );
      if (status === 'pending') {
        const verify = panel.getByRole('button', { name: '查核原表', exact: true });
        await verify.focus();
        await expect(verify).toBeFocused();
      }
    } finally {
      await context.close();
      await c.server.stop();
    }
  });
}

test('explains disabled activity actions and allows starting and ending with the keyboard', async ({
  browser,
}) => {
  const c = await uiClassroom(false),
    context = await browser.newContext();
  const cookie = c.client.cookie.split('=');
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: c.server.url }]);
  try {
    const page = await context.newPage();
    await page.goto(c.server.url);
    await expect(
      page.getByText('老師開放後，學生才能看到題目並提交答案。', { exact: true }),
    ).toBeVisible();
    const start = page.getByRole('button', { name: '開始搶答', exact: true });
    await start.focus();
    await start.press('Enter');
    await expect(start).toBeDisabled();
    await expect(page.getByText('活動正在收答，無須再次開始。', { exact: true })).toBeVisible();
    const end = page.getByRole('button', { name: '結束搶答並自動回填', exact: true });
    await end.focus();
    await end.press('Enter');
    await expect(page.getByText('本場沒有成功答案，原表不需更新。', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('keeps student questions private while waiting and supports named joining and answering by keyboard on a narrow screen', async ({
  browser,
}) => {
  const c = await uiClassroom(false),
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(c.server.studentUrl + '/student/' + c.activity.id);
    await page.getByLabel('組別名稱（1–40 字）').fill('鍵盤學生');
    const join = page.getByRole('button', { name: '第4組', exact: true });
    await join.focus();
    await join.press('Enter');
    await expect(page.getByRole('heading', { name: '第4組-鍵盤學生', exact: true })).toBeVisible();
    await expect(page.getByText('等待老師開放後才會顯示題目。', { exact: true })).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(0);
    await page.screenshot({ path: 'validation-results/feature-002-phase-7/student-waiting.png' });
    c.run(c.teacher, 'activity:start');
    const answer = page.getByRole('form', { name: '第 1 題', exact: true });
    await answer.getByRole('textbox').fill('學生答案');
    const submit = answer.getByRole('button', { name: '送出完整答案', exact: true });
    await submit.focus();
    await submit.press('Enter');
    await expect(
      answer.getByRole('button', { name: '本組答案已受理', exact: true }),
    ).toBeDisabled();
    await answer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'validation-results/feature-002-phase-7/student-answer.png' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await context.close();
    await c.server.stop();
  }
});
