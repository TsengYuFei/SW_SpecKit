import { expect, test } from '@playwright/test';
import { uiClassroom } from '../helpers/ui-classroom';
import { resultExportFixture } from '../helpers/result-export';
import { deferred } from '../helpers/google-adapter';
import { catalogServer } from '../helpers/catalog-server';
import { createPersistenceFixture } from '../helpers/persistence';

test('updates waiting/active history within two seconds, then refreshes ended detail exactly once', async ({
  browser,
}) => {
  const c = await uiClassroom(false),
    context = await browser.newContext();
  try {
    await c.server.worker!.stop();
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    let reads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/activities/' + c.activity.id) reads++;
    });
    await page.goto(c.server.url);
    await expect(
      page.getByRole('button', { name: '預覽 教材一（source-one）', exact: true }),
    ).toBeVisible();
    reads = 0; // Exclude SourcePage's existing initial detail read; measure the history view only.
    await page.getByRole('button', { name: /^查看 六題教材/ }).click();
    const detail = page.getByRole('region', { name: '歷史活動詳情', exact: true }),
      panel = detail.getByRole('region', { name: '已受理答案', exact: true });
    await expect(panel.getByText('尚無已受理答案。', { exact: true })).toBeVisible();
    c.run(c.teacher, 'activity:start');
    c.answer(0, 1, '第二題先到');
    c.answer(1, 0, '第一題先到');
    await expect(panel.getByRole('row')).toHaveCount(3, { timeout: 2000 });
    await expect(
      detail.getByRole('table', { name: '各組作答狀況', exact: true }).getByRole('row').nth(1),
    ).toContainText('已提交 1 題', { timeout: 2000 });
    await panel.getByRole('button', { name: '依題目', exact: true }).click();
    await expect(panel.getByRole('row').nth(1)).toContainText('全場 2');
    c.answer(0, 0, '第一題後到');
    await expect(panel.getByRole('row').nth(2)).toContainText('本題第 2 名', { timeout: 2000 });
    c.run(c.teacher, 'activity:end');
    await expect(detail.getByRole('button', { name: '下載本場 CSV' })).toBeEnabled({
      timeout: 2000,
    });
    expect(reads).toBe(2);
    await expect(panel.getByRole('button', { name: '全部收件', exact: true })).toBeVisible();
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('rereads a stale noncurrent activity once without polling or recreating it', async ({
  browser,
}) => {
  const c = await resultExportFixture({ historyCount: 2 }),
    context = await browser.newContext();
  try {
    c.server.catalog!.restoreCurrent();
    const id = c.histories[0]!;
    const items = (await (await c.client.get('/api/activities')).json()).data.items as {
      id: string;
    }[];
    const index = items.findIndex((item) => item.id === id);
    const old = await (await c.client.get('/api/activities/' + id)).json();
    old.data.phase = 'active';
    old.data.endedAt = null;
    old.data.snapshot.phase = 'active';
    delete old.data.snapshot.results;
    let reads = 0;
    await context.route('**/api/activities/' + id, async (route) => {
      reads++;
      if (reads === 1) await route.fulfill({ json: old });
      else await route.continue();
    });
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    await page
      .getByRole('button', { name: /^查看 合成教材/ })
      .nth(index)
      .click();
    await expect(
      page
        .getByRole('region', { name: '歷史活動詳情' })
        .getByRole('button', { name: '下載本場 CSV' }),
    ).toBeEnabled({ timeout: 2000 });
    expect(reads).toBe(2);
    expect(c.server.persistence.activities.current()!.id).toBe(c.histories[1]);
    expect(
      c.server.persistence.connection.database.prepare('SELECT id FROM activities').all(),
    ).toHaveLength(2);
  } finally {
    await context.close();
    await c.close();
  }
});

test('discards an old-account history response after authorization changes', async ({
  browser,
}) => {
  const c = await uiClassroom(),
    context = await browser.newContext();
  const entered = deferred<void>(),
    release = deferred<void>();
  try {
    c.answer(0, 0, '舊帳號隔離答案');
    const old = await (await c.client.get('/api/activities/' + c.activity.id)).json();
    await context.route('**/api/activities/' + c.activity.id, async (route) => {
      entered.resolve();
      await release.promise;
      try {
        await route.fulfill({ json: old });
      } catch {
        /* Request aborted on scope change. */
      }
    });
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    await page.getByRole('button', { name: /^查看 六題教材/ }).click();
    await entered.promise;
    await c.client.connect('owner-b');
    await expect(page.getByText('目前沒有已保存活動。', { exact: true })).toBeVisible();
    release.resolve();
    await expect(page.getByText('舊帳號隔離答案', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '歷史活動詳情' })).toHaveCount(0);
  } finally {
    release.resolve();
    await context.close();
    await c.server.stop();
  }
});

test('discards a late history response across an actual runtime boot change', async ({
  browser,
}) => {
  const c = await uiClassroom(),
    context = await browser.newContext();
  const entered = deferred<void>(),
    release = deferred<void>();
  let replacement: Awaited<ReturnType<typeof catalogServer>> | undefined;
  try {
    c.answer(0, 0, '舊boot待驗答案');
    const old = await (await c.client.get('/api/activities/' + c.activity.id)).json();
    await context.route('**/api/activities/' + c.activity.id, async (route) => {
      entered.resolve();
      await release.promise;
      try {
        await route.fulfill({ json: old });
      } catch {
        /* Request aborted across boot. */
      }
    });
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    await page.getByRole('button', { name: /^查看 六題教材/ }).click();
    await entered.promise;
    await c.server.stop(true);
    replacement = await catalogServer(
      'teacher',
      createPersistenceFixture(c.server.persistence.directory),
      {
        teacher: Number(new URL(c.server.url).port),
        student: Number(new URL(c.server.studentUrl).port),
      },
    );
    expect(replacement.store.bootId).not.toBe(c.server.store.bootId);
    await expect(page.getByRole('region', { name: '歷史活動', exact: true })).toHaveCount(0, {
      timeout: 10000,
    });
    release.resolve();
    await expect(page.getByText('舊boot待驗答案', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '授權 Google Sheets', exact: true }).click();
    await expect(page.getByRole('button', { name: /^查看 六題教材/ })).toBeVisible();
  } finally {
    release.resolve();
    await context.close();
    if (replacement) await replacement.stop();
    else await c.server.stop();
  }
});
