import { idSchema } from '@classroom/shared/schemas/common';
export function exportFilename(title: string, id: string, at: number) {
  idSchema.parse(id);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  const time =
    get('year') + get('month') + get('day') + '-' + get('hour') + get('minute') + get('second');
  const prefix = '搶答結果_',
    suffix = `_${id}_${time}.csv`;
  const sanitized =
    [...title]
      .map((c) =>
        c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '<>:"/\\|?*'.includes(c) ? '_' : c,
      )
      .join('')
      .replace(/[ .]+$/u, '') || '未命名活動';
  let name = '',
    bytes = Buffer.byteLength(prefix + suffix),
    units = prefix.length + suffix.length;
  for (const c of sanitized) {
    const size = Buffer.byteLength(c);
    if (bytes + size > 240 || units + c.length > 240) break;
    name += c;
    bytes += size;
    units += c.length;
  }
  name = name.replace(/[ .]+$/u, '') || '未命名活動';
  const filename = prefix + name + suffix;
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return {
    filename,
    disposition: `attachment; filename="buzzer_results_${id}_${time}.csv"; filename*=UTF-8''${encoded}`,
  };
}
