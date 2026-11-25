import { existsSync, lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const prefix = 'classroom-buzzer-test-';
const samePath = (left: string, right: string) =>
  process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

export function openTemporaryDatabase(directory: string) {
  const root = realpathSync(tmpdir());
  const target = resolve(directory);
  if (!samePath(dirname(target), root) || !basename(target).startsWith(prefix))
    throw new Error('測試資料庫目錄不在允許的臨時範圍');
  function verify() {
    if (lstatSync(target).isSymbolicLink() || !samePath(realpathSync(target), target))
      throw new Error('測試資料庫目錄不能重新導向其他位置');
  }
  verify();
  return Object.freeze({
    directory: target,
    databasePath: join(target, 'classroom.sqlite'),
    cleanup() {
      if (!existsSync(target)) return;
      verify();
      // Only the verified, immutable directory created for this test can be removed.
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  });
}

export function createTemporaryDatabase() {
  return openTemporaryDatabase(mkdtempSync(join(realpathSync(tmpdir()), prefix)));
}
