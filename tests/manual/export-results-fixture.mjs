import { build } from 'esbuild';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('validation-results');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output')
  throw new Error('請使用 --output validation-results/feature-003-acceptance');
const output = resolve(args[1]);
const inside = relative(root, output);
if (!inside || inside.startsWith('..') || resolve(root, inside) !== output)
  throw new Error('輸出必須位於專案validation-results子目錄');
mkdirSync(root, { recursive: true });
if (realpathSync(root) !== root) throw new Error('輸出根目錄不得重新導向');
let current = root;
for (const part of inside.split(sep)) {
  current = join(current, part);
  if (
    existsSync(current) &&
    (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory())
  )
    throw new Error('輸出路徑不得重新導向');
  mkdirSync(current, { recursive: true });
}
const owned = mkdtempSync(join(output, 'run-'));
const runtimePath = join(owned, 'fixture-runtime.mjs');
const bundle = await build({
  entryPoints: ['tests/helpers/result-export.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  alias: { '@classroom/shared': resolve('shared/src') },
});
writeFileSync(runtimePath, bundle.outputFiles[0].contents, { flag: 'wx' });
const { resultExportFixture } = await import(pathToFileURL(runtimePath).href);
const cases = [
  '=1+1',
  '+1+1',
  '-1+1',
  '@SUM(1,1)',
  '＝1+1',
  '＋1+1',
  '－1+1',
  '＠SUM(1,1)',
  ' =1+1',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
  '\uFEFF=1+1',
  '中文😀,"引號"\n第二行',
];
const files = [];
try {
  for (const kind of ['normal', 'safe-text']) {
    const c = await resultExportFixture(kind === 'safe-text' ? { kind: 'performance' } : {});
    try {
      const id = c.histories[0],
        db = c.server.persistence.connection.database;
      if (kind === 'safe-text') {
        const answers = db
          .prepare(
            `SELECT a.submission_id,a.item_id FROM submission_answers a
          JOIN submissions s ON s.activity_id=a.activity_id AND s.id=a.submission_id
          JOIN question_items i ON i.activity_id=a.activity_id AND i.question_id=a.question_id AND i.item_id=a.item_id
          WHERE a.activity_id=? ORDER BY s.sequence,i.ordinal LIMIT ?`,
          )
          .all(id, cases.length);
        c.server.persistence.connection.transaction(() =>
          answers.forEach((row, i) =>
            db
              .prepare(
                'UPDATE submission_answers SET answer=? WHERE activity_id=? AND submission_id=? AND item_id=?',
              )
              .run(cases[i], id, row.submission_id, row.item_id),
          ),
        );
      }
      await c.setGoogleOffline(true);
      const response = await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
        headers: c.client.headers,
      });
      if (response.status !== 200) throw new Error('合成下載端點驗證失敗');
      const filename = decodeURIComponent(
        /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition'))[1],
      );
      if (basename(filename) !== filename || dirname(filename) !== '.')
        throw new Error('下載檔名不是安全basename');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes[0] !== 239 || bytes[1] !== 187 || bytes[2] !== 191) throw new Error('合成檔缺BOM');
      writeFileSync(join(owned, filename), bytes, { flag: 'wx' });
      files.push({
        kind,
        filename,
        bytes: bytes.length,
        dataRows: kind === 'normal' ? 3 : 40,
        columns: kind === 'normal' ? 9 : 63,
        activityId: id,
      });
    } finally {
      await c.close();
    }
  }
  writeFileSync(
    join(owned, 'manifest.json'),
    JSON.stringify({ files, safeTextColumn: 'E', safeTextDataRows: '2–15', cases }, null, 2),
    { flag: 'wx' },
  );
  console.info(JSON.stringify({ output: owned, files }, null, 2));
} finally {
  unlinkSync(runtimePath);
}
