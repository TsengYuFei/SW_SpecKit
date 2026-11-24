import type { PublicError } from '../schemas/common.js';

export type Envelope<T> =
  | { ok: true; data: T; revision: number }
  | { ok: false; error: PublicError; revision: number };

export function success<T>(data: T, revision = 0): Envelope<T> {
  return { ok: true, data, revision };
}
