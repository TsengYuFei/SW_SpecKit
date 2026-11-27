import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { automaticFixture } from '../helpers/automatic-writeback';
import { installClipboard, clipboardState } from '../helpers/clipboard';
import { publishActivity } from '../../backend/src/sockets/activity-handlers';
import { uiClassroom } from '../helpers/ui-classroom';

test('keeps completed group answers and verified Google writeback unchanged through both views, downloads, copy and history reopen', async ({
  browser,
}) => {
  const c = await automaticFixture();
  const context = await browser.newContext();
  try {
    await installClipboard(context, 'resolve');
    c.answer();
    c.run(c.b, 'answer:submit', {
      questionId: c.question.id,
      answers: Object.fromEntries(c.question.items.map((item) => [item.id, '第二組完整答案'])),
    });
    c.end();
    await c.server.worker!.drain();
    expect(c.server.persistence.writebacks.getForActivity(c.activity.id)!.status).toBe('verified');
    expect(c.writes).toHaveLength(1);
    publishActivity(c.store);
    const db = c.server.persistence.connection.database;
    const rows = () =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((row) => ({
          table: row.name,
          rows: db
            .prepare(
              'SELECT * FROM "' + String(row.name).replaceAll('"', '""') + '" ORDER BY rowid',
            )
            .all(),
        }));
    const before = rows();
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    const current = page.getByRole('region', { name: '活動控制', exact: true });
    const panel = current.getByRole('region', { name: '已受理答案', exact: true });
    await expect(panel.getByRole('row')).toHaveCount(3);
    await expect(panel.getByRole('row').nth(1)).toContainText('全場 1');
    await panel.getByRole('button', { name: '依題目', exact: true }).click();
    await expect(panel.getByRole('row').nth(1)).toContainText('本題第 1 名');
    await expect(panel.getByRole('row').nth(2)).toContainText('本題第 2 名');
    const pending = page.waitForEvent('download');
    await current.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
    const download = await pending;
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(bytes.toString('utf8')).toContain('第二組完整答案');
    await current.getByRole('button', { name: '複製活動連結', exact: true }).click();
    await expect(current.getByText('已複製活動連結', { exact: true })).toBeVisible();
    expect((await clipboardState(page)).writes).toEqual([
      c.server.studentUrl + '/student/' + c.activity.id,
    ]);
    await page.getByRole('button', { name: /^查看 教材一/ }).click();
    const history = page.getByRole('region', { name: '歷史活動詳情', exact: true });
    const next = page.waitForEvent('download');
    await history.getByRole('button', { name: '下載本場 CSV', exact: true }).click();
    const historical = await next;
    expect(await readFile((await historical.path())!)).toEqual(bytes);
    await page.reload();
    await page.getByRole('button', { name: /^查看 教材一/ }).click();
    await expect(
      history.getByRole('region', { name: '已受理答案', exact: true }).getByRole('row'),
    ).toHaveCount(3);
    expect(rows()).toEqual(before);
    expect(c.writes).toHaveLength(1);
    expect(
      c.grid.rows[c.question.items[0]!.target.rowIndex]![c.question.items[0]!.target.columnIndex]!
        .userEnteredValue,
    ).toEqual({ stringValue: '=SUM(A1)' });
  } finally {
    await context.close();
    await c.server.stop();
  }
});

test('reads complete grouped answers with four groups and six questions at 1280 by 720 using the keyboard', async ({
  browser,
}) => {
  const c = await uiClassroom(true, 6, true);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const group = c.activity.questions[5]!;
    expect(group.kind).toBe('group');
    expect(group.items).toHaveLength(2);
    const text = '完整的多行答案\n第二行保留';
    c.answer(0, 5, text);
    const [name, value] = c.client.cookie.split('=');
    await context.addCookies([{ name: name!, value: value!, url: c.server.url }]);
    const page = await context.newPage();
    await page.goto(c.server.url);
    const panel = page
      .getByRole('region', { name: '活動控制', exact: true })
      .getByRole('region', { name: '已受理答案', exact: true });
    await expect(panel.getByRole('row').nth(1)).toContainText(c.longName);
    const button = panel.getByRole('button', { name: '依題目', exact: true });
    await button.focus();
    await button.press('Space');
    await panel.getByLabel('選擇題目', { exact: true }).selectOption(group.id);
    await expect(panel.getByRole('row').nth(1)).toContainText('全場 1');
    await expect(panel.getByRole('row').nth(1)).toContainText('本題第 1 名');
    await expect(panel.getByText(text, { exact: true })).toHaveCount(2);
    await expect(panel.getByText('（2） 題組補充子題', { exact: true })).toBeVisible();
    const scroll = panel.getByRole('region', { name: '收件順位表格，可橫向捲動', exact: true });
    await scroll.focus();
    await expect(scroll).toBeFocused();
    await panel.screenshot({
      path: 'validation-results/feature-003-phase-6/four-groups-six-questions.png',
    });
  } finally {
    await context.close();
    await c.server.stop();
  }
});
