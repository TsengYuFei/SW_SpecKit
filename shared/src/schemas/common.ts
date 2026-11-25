import { z } from 'zod';

export const roleSchema = z.enum(['teacher', 'student']);
export type Role = z.infer<typeof roleSchema>;
export const idSchema = z.uuid();
export const phaseSchema = z.enum(['waiting', 'active', 'ended']);
export type Phase = z.infer<typeof phaseSchema>;
export const revisionSchema = z.number().int().nonnegative().safe();
export const groupCountSchema = z.number().int().positive().safe();
export const commandSchema = z.strictObject({ activityId: idSchema, requestId: idSchema });

export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'GROUP_OCCUPIED',
  'ALREADY_JOINED',
  'INCOMPLETE_ANSWERS',
  'ALREADY_SUBMITTED',
  'REQUEST_CONFLICT',
  'INVALID_PHASE',
  'ACTIVITY_UNAVAILABLE',
  'MAPPING_AMBIGUOUS',
  'SOURCE_CONFLICT',
  'SOURCE_TOO_LARGE',
  'GOOGLE_AUTH_REQUIRED',
  'GOOGLE_FORBIDDEN',
  'SHEET_NOT_FOUND_OR_INACCESSIBLE',
  'NETWORK_ERROR',
  'GOOGLE_ERROR',
  'WRITE_PENDING',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'NAME_LOCKED',
  'CURSOR_INVALID',
  'PREVIEW_EXPIRED',
  'SOURCE_READ_ONLY',
  'SOURCE_UNSUPPORTED',
  'STORAGE_UNAVAILABLE',
  'STORAGE_CORRUPT',
  'SYSTEM_BUSY',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export interface PublicError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}
