import { buildSync } from 'esbuild';
import { expect, test } from '@playwright/test';
import { clipboardState, installClipboard, settleClipboard } from '../helpers/clipboard';

const initial = {
  studentUrl: 'http://127.0.0.1:3001/student/11111111-1111-4111-8111-111111111111',
  scope: {
    activityId: '11111111-1111-4111-8111-111111111111',
    bootId: 'boot-a',
    sessionVersion: 1,
    authGeneration: 1,
  },
};

for (const change of ['url', 'account', 'boot', 'session', 'unmount', 'missing'] as const) {
  test(`fences delayed clipboard feedback after ${change}`, async ({ browser }) => {
    const source = buildSync({
      stdin: {
        contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CopyActivityLinkButton} from './frontend/src/components/CopyActivityLinkButton'; const root=createRoot(document.getElementById('root')); window.renderCopy=(props)=>root.render(React.createElement(CopyActivityLinkButton,props)); window.unmountCopy=()=>root.unmount(); window.renderCopy(${JSON.stringify(initial)});`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    }).outputFiles[0]!.text;
    const context = await browser.newContext();
    try {
      await installClipboard(context, 'pending');
      await context.route('**/__copy-host', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<div id="root"></div><script>${source}</script>`,
        }),
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:3010/__copy-host');
      const button = page.getByRole('button', { name: '複製活動連結', exact: true });
      await button.click();
      await expect(button).toBeDisabled();
      if (change === 'unmount') {
        await page.evaluate(() => (window as unknown as { unmountCopy: () => void }).unmountCopy());
        await settleClipboard(page, false);
        await expect(button).toHaveCount(0);
      } else {
        const next = structuredClone(initial);
        if (change === 'url') {
          next.scope.activityId = '22222222-2222-4222-8222-222222222222';
          next.studentUrl = `http://127.0.0.1:3001/student/${next.scope.activityId}`;
        }
        if (change === 'account') next.scope.authGeneration++;
        if (change === 'boot') next.scope.bootId = 'boot-b';
        if (change === 'session') next.scope.sessionVersion++;
        if (change === 'missing') next.studentUrl = '';
        await page.evaluate(
          (props) =>
            (window as unknown as { renderCopy: (props: unknown) => void }).renderCopy(props),
          next,
        );
        if (change === 'missing') {
          await expect(button).toBeDisabled();
          await expect(
            page.getByText('目前沒有有效的學生加入連結。', { exact: true }),
          ).toBeVisible();
          await settleClipboard(page);
        } else {
          await expect(button).toBeEnabled();
          await button.click();
          await settleClipboard(page);
          await expect(button).toBeDisabled();
          await expect(page.getByText('已複製活動連結', { exact: true })).toHaveCount(0);
          await settleClipboard(page);
          await expect(page.getByText('已複製活動連結', { exact: true })).toBeVisible({
            timeout: 1000,
          });
          expect((await clipboardState(page)).writes).toEqual([
            initial.studentUrl,
            next.studentUrl,
          ]);
        }
      }
      expect((await clipboardState(page)).reads).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
