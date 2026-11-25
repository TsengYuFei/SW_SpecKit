import { AppError } from '../security/safe-errors.js';
export function googleError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const data = error as { response?: { status?: number }; code?: string | number } | null;
  const status = data?.response?.status ?? Number(data?.code);
  if (status === 400) return new AppError('INVALID_INPUT');
  if (status === 401) return new AppError('GOOGLE_AUTH_REQUIRED');
  if (status === 403) return new AppError('GOOGLE_FORBIDDEN');
  if (status === 404) return new AppError('SHEET_NOT_FOUND_OR_INACCESSIBLE');
  if (status === 429) return new AppError('RATE_LIMITED');
  if (
    ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(
      String(data?.code),
    )
  )
    return new AppError('NETWORK_ERROR');
  return new AppError('GOOGLE_ERROR');
}
