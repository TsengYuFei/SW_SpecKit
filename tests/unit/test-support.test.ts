import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTemporaryDatabase } from '../helpers/temporary-database.js';
import { createPlaywrightDatabase } from '../helpers/playwright-database.js';
import { startTestProcess } from '../helpers/process-harness.js';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it('isolates database paths and cleans only its own directory including SQLite sidecars', () => {
  const first = createTemporaryDatabase();
  const second = createTemporaryDatabase();
  cleanups.push(second.cleanup, first.cleanup);
  expect(first.databasePath).not.toBe(second.databasePath);
  writeFileSync(second.databasePath, 'other-test-data');
  for (const suffix of ['', '-wal', '-shm']) writeFileSync(first.databasePath + suffix, 'test');
  first.cleanup();
  first.cleanup();
  expect(existsSync(first.directory)).toBe(false);
  expect(readFileSync(second.databasePath, 'utf8')).toBe('other-test-data');
});

it('gives each Playwright run a fresh path and rejects a formal database override', () => {
  const first = createPlaywrightDatabase();
  const second = createPlaywrightDatabase();
  cleanups.push(first.cleanup, second.cleanup);
  expect(first.databasePath).not.toBe(second.databasePath);
  expect(first.env.DATABASE_PATH).toBe(first.databasePath);
  expect(() =>
    first.webServerEnv({ DATABASE_PATH: join(process.cwd(), 'data/classroom.sqlite') }),
  ).toThrow('測試服務不得覆寫隔離資料庫路徑');
  expect(first.webServerEnv({ TEACHER_PORT: '3010' }).DATABASE_PATH).toBe(first.databasePath);
});

it('runs an isolated Node child, receives IPC, and reuses one database across a restart', async () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  const entry = join(temporary.directory, 'child.mjs');
  writeFileSync(
    entry,
    `
    import { appendFileSync, readFileSync } from 'node:fs';
    appendFileSync(process.env.DATABASE_PATH, 'x');
    process.send({ kind: 'ready', count: readFileSync(process.env.DATABASE_PATH, 'utf8').length,
      parentOnly: Boolean(process.env.CLASSROOM_PARENT_ONLY_CANARY) });
    process.on('message', () => process.exit(0));
  `,
  );
  const prior = process.env.CLASSROOM_PARENT_ONLY_CANARY;
  process.env.CLASSROOM_PARENT_ONLY_CANARY = 'invalid-test-canary';
  try {
    const first = await startTestProcess({
      entryPath: entry,
      env: { DATABASE_PATH: temporary.databasePath },
    });
    cleanups.push(first.stop);
    expect(await first.waitForMessage((value) => value.kind === 'ready')).toEqual({
      kind: 'ready',
      count: 1,
      parentOnly: false,
    });
    first.child.send({ kind: 'stop' });
    expect((await first.waitForExit()).code).toBe(0);
    const second = await startTestProcess({
      entryPath: entry,
      env: { DATABASE_PATH: temporary.databasePath },
    });
    cleanups.push(second.stop);
    expect(await second.waitForMessage((value) => value.kind === 'ready')).toMatchObject({
      count: 2,
    });
  } finally {
    if (prior === undefined) delete process.env.CLASSROOM_PARENT_ONLY_CANARY;
    else process.env.CLASSROOM_PARENT_ONLY_CANARY = prior;
  }
});

it('reports a child exit instead of leaving a pending message waiter', async () => {
  const temporary = createTemporaryDatabase();
  cleanups.push(temporary.cleanup);
  const entry = join(temporary.directory, 'exit.mjs');
  writeFileSync(entry, 'process.exit(7);');
  const processTest = await startTestProcess({ entryPath: entry });
  cleanups.push(processTest.stop);
  await expect(processTest.waitForMessage(() => true)).rejects.toThrow('測試行程已結束');
  expect((await processTest.waitForExit()).code).toBe(7);
});
