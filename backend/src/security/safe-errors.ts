import { ZodError } from 'zod';
import type { ErrorCode, PublicError } from '@classroom/shared/schemas/common';

const errors: Record<ErrorCode, [number, string, boolean]> = {
  INVALID_INPUT: [400, '輸入無效，請檢查欄位及長度限制。', false],
  UNAUTHORIZED: [401, '請重新開啟頁面建立使用者身分。', false],
  FORBIDDEN: [403, '目前身分或來源無權執行此操作。', false],
  GROUP_OCCUPIED: [409, '此組已被其他瀏覽器加入，請選擇空組。', false],
  ALREADY_JOINED: [409, '此瀏覽器已加入另一組。', false],
  INCOMPLETE_ANSWERS: [400, '請填寫題組全部小題後一起送出。', false],
  ALREADY_SUBMITTED: [409, '此組已提交本題，保留第一次有效答案。', false],
  REQUEST_CONFLICT: [409, '此請求編號已用於不同內容，請重新操作。', false],
  INVALID_PHASE: [409, '目前活動階段不允許此操作。', false],
  ACTIVITY_UNAVAILABLE: [404, '活動已不可用，請使用老師提供的新活動連結。', false],
  MAPPING_AMBIGUOUS: [409, '無法確認全部題目與作答位置，請修正來源教材後重讀。', false],
  SOURCE_CONFLICT: [409, '來源教材已改動，請重新核對題目及填空位置。', false],
  SOURCE_TOO_LARGE: [400, '教材範圍超過本機可處理上限，請縮小多餘空白範圍或調整執行設定。', false],
  GOOGLE_AUTH_REQUIRED: [401, '請由老師重新完成 Google 授權。', false],
  GOOGLE_FORBIDDEN: [403, 'Google 權限不足或存取受限，請檢查共用權限及配額。', false],
  SHEET_NOT_FOUND_OR_INACCESSIBLE: [
    404,
    '找不到試算表，或目前帳號無權存取，請檢查 ID 與共用權限。',
    false,
  ],
  NETWORK_ERROR: [503, '連線中斷，操作尚未確認，請檢查網路後重試。', true],
  GOOGLE_ERROR: [502, 'Google 服務暫時無法完成操作，請稍後重試。', true],
  WRITE_PENDING: [409, '回寫結果尚待確認，請先查核原試算表。', true],
  RATE_LIMITED: [429, '操作過於頻繁，請稍後重試。', true],
  INTERNAL_ERROR: [500, '系統暫時無法完成操作，請稍後重試。', true],
  NAME_LOCKED: [409, '組名已確認，無法更改。', false],
  CURSOR_INVALID: [400, '清單位置已失效，請重新搜尋或載入。', false],
  PREVIEW_EXPIRED: [409, '教材預覽已失效，請重新選取並核對。', false],
  SOURCE_READ_ONLY: [403, '此教材只有讀取權限，請選擇可編輯的試算表。', false],
  SOURCE_UNSUPPORTED: [400, '第一個工作表不支援作為本次教材，請確認工作表類型。', false],
  STORAGE_UNAVAILABLE: [503, '儲存暫時無法完成，操作未確認，請檢查儲存空間與權限後重試。', true],
  STORAGE_CORRUPT: [503, '儲存資料無法安全載入，請保留原資料並檢查備份與版本。', false],
  SYSTEM_BUSY: [409, '目前仍有活動或待確認回填，請先完成處理再建立新活動。', true],
  EXPORT_BUSY: [503, '匯出暫時忙碌或逾時，未產生檔案，請稍後手動重試。', true],
  EXPORT_TOO_LARGE: [
    422,
    '結果超過 Excel 或本機匯出容量限制，未產生檔案；資料已保留且未截斷。',
    false,
  ],
};

export class AppError extends Error {
  constructor(readonly code: ErrorCode) {
    super(errors[code][1]);
  }
  get status() {
    return errors[this.code][0];
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError('INVALID_INPUT');
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_SQLITE_ERROR' &&
    'errcode' in error &&
    typeof error.errcode === 'number'
  ) {
    const primary = error.errcode & 255;
    return new AppError(
      primary === 19
        ? 'INVALID_INPUT'
        : primary === 11 || primary === 26
          ? 'STORAGE_CORRUPT'
          : 'STORAGE_UNAVAILABLE',
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    ['entity.too.large', 'entity.parse.failed'].includes(String(error.type))
  ) {
    return new AppError('INVALID_INPUT');
  }
  return new AppError('INTERNAL_ERROR');
}

export function safeError(error: unknown): PublicError {
  const normalized = normalizeError(error);
  return {
    code: normalized.code,
    message: errors[normalized.code][1],
    retryable: errors[normalized.code][2],
  };
}
