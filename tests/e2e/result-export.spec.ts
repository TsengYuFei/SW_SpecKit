import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { resultExportFixture } from '../helpers/result-export';
import { deferred } from '../helpers/google-adapter';

for (const failure of [
  'malformed',
  'empty',
  'parser-exception',
  'body-exception',
  'known-code',
  'unknown-code',
] as const) {
  test(`keeps ${failure} export errors safe and never starts a download`, async ({ browser }) => {
    const c = await resultExportFixture();
    const context = await browser.newContext();
    const marker = 'DEMO_X';
    try {
      c.server.catalog!.restoreCurrent();
      const [name, value] = c.client.cookie.split('=');
      await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
      if (failure === 'parser-exception' || failure === 'body-exception') {
        await context.addInitScript(
          ({ failure, marker }) => {
            const original = window.fetch;
            window.fetch = async (...args) => {
              const response = await original(...args);
              if (String(args[0]).endsWith('/export.csv')) {
                Object.defineProperty(response, failure === 'parser-exception' ? 'json' : 'blob', {
                  value: async () => {
                    throw new Error(marker + ' internal parser detail');
                  },
                });
              }
              return response;
            };
          },
          { failure, marker },
        );
      }
      await context.route('**/export.csv', (route) =>
        route.fulfill({
          status: failure === 'body-exception' ? 200 : 503,
          headers:
            failure === 'body-exception'
              ? {
                  'content-type': 'text/csv; charset=utf-8',
                  'content-disposition': 'attachment; filename="invalid-demo.csv"',
                }
              : { 'content-type': 'application/json' },
          body:
            failure === 'malformed'
              ? marker
              : failure === 'empty'
                ? ''
                : failure === 'body-exception'
                  ? '\uFEFFx\r\n'
                  : JSON.stringify({
                      ok: false,
                      error: {
                        code: failure === 'unknown-code' ? 'INVALID_DEMO' : 'EXPORT_BUSY',
                        message: marker,
                      },
                    }),
        }),
      );
      const page = await context.newPage();
      let downloads = 0;
      const diagnostics: string[] = [];
      page.on('download', () => downloads++);
      page.on('console', (message) => diagnostics.push(message.text()));
      page.on('pageerror', (error) => diagnostics.push(error.message));
      await page.goto(c.server.url);
      const current = page.getByRole('region', { name: '活動控制', exact: true });
      await current.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
      await expect(current.getByRole('alert')).toHaveText(
        failure === 'known-code'
          ? '匯出暫時忙碌或逾時，請稍後手動重試。'
          : '無法匯出結果，未開始下載。',
      );
      await expect(page.locator('body')).not.toContainText(marker);
      expect(diagnostics.join('\n')).not.toContain(marker);
      expect(downloads).toBe(0);
      await expect(current.getByText('已開始下載', { exact: true })).toHaveCount(0);
      await expect(
        current.getByRole('button', { name: '下載本場 CSV', exact: true }),
      ).toBeEnabled();
    } finally {
      await context.close();
      await c.close();
    }
  });
}
test('downloads one current and selected history activity with BOM, full filename and honest status', async ({
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
    const current = page.getByRole('region', { name: '活動控制', exact: true });
    const downloadEvent = page.waitForEvent('download');
    await current.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toContain(c.histories[0]!);
    expect([...(await readFile((await download.path())!)).subarray(0, 3)]).toEqual([239, 187, 191]);
    await expect(current.getByText('已開始下載', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^查看 合成教材/ }).click();
    const history = page.getByRole('region', { name: '歷史活動詳情' });
    await expect(history.getByRole('button', { name: '下載本場 CSV', exact: true })).toBeEnabled();
    const next = page.waitForEvent('download');
    await history.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
    const historical = await next;
    expect(historical.suggestedFilename()).toContain(c.histories[0]!);
    await historical.path();
  } finally {
    await context.close();
    await c.close();
  }
});

for (const failure of ['json', 'html', 'wrong-mime', 'body-failure'] as const) {
  test(`does not download ${failure} and gives a clear failure`, async ({ browser }) => {
    const c = await resultExportFixture();
    const context = await browser.newContext();
    try {
      c.server.catalog!.restoreCurrent();
      const [name, value] = c.client.cookie.split('=');
      await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
      await context.route('**/export.csv', (route) =>
        failure === 'body-failure'
          ? route.abort('failed')
          : route.fulfill({
              status: 200,
              contentType:
                failure === 'json'
                  ? 'application/json'
                  : failure === 'html'
                    ? 'text/html'
                    : 'text/plain',
              body: 'invalid-demo-response',
            }),
      );
      const page = await context.newPage();
      let downloads = 0;
      page.on('download', () => downloads++);
      await page.goto(c.server.url);
      const current = page.getByRole('region', { name: '活動控制', exact: true });
      await current.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
      await expect(current.getByRole('alert')).toContainText('未開始下載');
      expect(downloads).toBe(0);
    } finally {
      await context.close();
      await c.close();
    }
  });
}

test('abandons a pending history download when switching activity and leaves active downloads disabled', async ({
  browser,
}) => {
  const c = await resultExportFixture({ active: true });
  const context = await browser.newContext();
  const entered = deferred<void>(),
    release = deferred<void>();
  try {
    c.server.catalog!.restoreCurrent();
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    await context.route('**/export.csv', async (route) => {
      entered.resolve();
      await release.promise;
      try {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="invalid-demo.csv"',
          },
          body: '\uFEFFx\r\n',
        });
      } catch {
        /* The cancelled route may already be closed. */
      }
    });
    const page = await context.newPage();
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.goto(c.server.url);
    await expect(
      page
        .getByRole('region', { name: '活動控制', exact: true })
        .getByRole('button', { name: '下載本場 CSV' }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: /^查看 合成教材/ })
      .last()
      .click();
    const detail = page.getByRole('region', { name: '歷史活動詳情' });
    await detail.getByRole('button', { name: '下載本場 CSV' }).click();
    await entered.promise;
    await detail.getByRole('button', { name: '返回歷史清單' }).click();
    release.resolve();
    await expect(detail).toHaveCount(0);
    expect(downloads).toBe(0);
  } finally {
    release.resolve();
    await context.close();
    await c.close();
  }
});
