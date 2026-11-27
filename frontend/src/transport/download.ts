import { errorCodeSchema } from '@classroom/shared/schemas/common';

export interface OperationScope {
  activityId: string;
  bootId: string;
  sessionVersion: number;
  authGeneration: number;
  epoch: number;
}
export type TeacherScope = Pick<OperationScope, 'bootId' | 'sessionVersion' | 'authGeneration'>;
const messages: Record<string, string> = {
  GOOGLE_AUTH_REQUIRED: '請重新授權 Google 後再匯出。',
  UNAUTHORIZED: '請重新整理頁面後再匯出。',
  FORBIDDEN: '目前無權匯出此活動，請重新整理後確認帳號。',
  ACTIVITY_UNAVAILABLE: '活動不存在或不屬於目前帳號。',
  INVALID_PHASE: '活動結束後才能匯出結果。',
  EXPORT_BUSY: '匯出暫時忙碌或逾時，請稍後手動重試。',
  RATE_LIMITED: '匯出過於頻繁，請稍後手動重試。',
  EXPORT_TOO_LARGE: '結果超過匯出容量限制，未產生檔案。',
  STORAGE_CORRUPT: '活動資料無法完整匯出，請保留資料並檢查備份。',
  STORAGE_UNAVAILABLE: '活動資料暫時無法讀取，請稍後再試。',
};
export function attachmentFilename(header: string | null) {
  if (!header || !/^attachment\s*;/i.test(header))
    throw new Error('下載回應格式無效，未開始下載。');
  const extended = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]*)/i.exec(header);
  if (/(?:^|;)\s*filename\*\s*=/i.test(header) && !extended)
    throw new Error('下載檔名無效，未開始下載。');
  const plain = /(?:^|;)\s*filename\s*=\s*"([^"]*)"/i.exec(header);
  let name: string;
  try {
    name = extended ? decodeURIComponent(extended[1]!.trim()) : (plain?.[1] ?? '');
  } catch {
    throw new Error('下載檔名無效，未開始下載。');
  }
  if (
    !name ||
    !name.endsWith('.csv') ||
    /[<>:"/\\|?*]/.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('下載檔名無效，未開始下載。');
  return name;
}
export async function downloadResults(input: {
  scope: OperationScope;
  csrfToken: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
}) {
  const check = () => {
    if (input.signal.aborted || !input.isCurrent()) throw new Error('下載已取消。');
  };
  let url: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (url) {
      URL.revokeObjectURL(url);
      url = undefined;
    }
    input.signal.removeEventListener('abort', cleanup);
  };
  input.signal.addEventListener('abort', cleanup, { once: true });
  let started = false;
  try {
    check();
    const response = await fetch(
      `/api/activities/${encodeURIComponent(input.scope.activityId)}/export.csv`,
      {
        credentials: 'same-origin',
        headers: { 'x-csrf-token': input.csrfToken, Accept: 'text/csv' },
        signal: input.signal,
      },
    );
    check();
    if (response.status !== 200) {
      let message = '無法匯出結果，未開始下載。';
      if (/^application\/json\b/i.test(response.headers.get('content-type') ?? '')) {
        const value = await response.json();
        check();
        const code = errorCodeSchema.safeParse(value?.ok === false ? value.error?.code : undefined);
        if (code.success) message = messages[code.data] ?? message;
      }
      throw new Error(message);
    }
    if (!/^text\/csv\s*;\s*charset=utf-8\s*$/i.test(response.headers.get('content-type') ?? ''))
      throw new Error('下載回應格式無效，未開始下載。');
    const name = attachmentFilename(response.headers.get('content-disposition'));
    const blob = await response.blob();
    check();
    const bom = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    check();
    if (bom.length !== 3 || bom[0] !== 239 || bom[1] !== 187 || bom[2] !== 191)
      throw new Error('下載內容不完整，未開始下載。');
    url = URL.createObjectURL(blob);
    check();
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    try {
      check();
      anchor.click();
      started = true;
    } finally {
      anchor.remove();
    }
  } catch (error) {
    if (error instanceof TypeError) throw new Error('下載連線中斷，未開始下載，請稍後重試。');
    throw error;
  } finally {
    if (started && url) timer = setTimeout(cleanup, 0);
    else cleanup();
  }
}
