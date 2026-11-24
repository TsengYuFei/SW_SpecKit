import { randomBytes } from 'node:crypto';
import type { GoogleGateway, TokenSet } from './sheets-client.js';
import { AppError, safeError } from '../security/safe-errors.js';
import { sameSecret } from '../security/sessions.js';

export function createOAuth(gateway: GoogleGateway, clock = Date.now) {
  const pending = new Map<string, { state: string; teacherSessionId: string; expiresAt: number }>();
  const tokens = new Map<string, TokenSet>();
  const failures = new Map<string, ReturnType<typeof safeError>>();
  function begin(teacherSessionId: string) {
    const state = randomBytes(32).toString('hex');
    const url = gateway.authorizationUrl(state);
    pending.set(teacherSessionId, { state, teacherSessionId, expiresAt: clock() + 300000 });
    failures.delete(teacherSessionId);
    return url;
  }
  async function finish(teacherSessionId: string, state: string, code: string) {
    const entry = pending.get(teacherSessionId);
    if (!entry || !sameSecret(entry.state, state)) throw new AppError('FORBIDDEN');
    pending.delete(teacherSessionId);
    if (entry.expiresAt <= clock() || !code) throw new AppError('GOOGLE_AUTH_REQUIRED');
    const credentials = await gateway.exchange(code);
    if (!credentials.access_token) throw new AppError('GOOGLE_AUTH_REQUIRED');
    tokens.set(teacherSessionId, credentials);
    failures.delete(teacherSessionId);
  }
  function credentials(teacherSessionId: string) {
    const value = tokens.get(teacherSessionId);
    if (!value) throw new AppError('GOOGLE_AUTH_REQUIRED');
    return value;
  }
  return {
    begin,
    finish,
    credentials,
    failed(teacherSessionId: string, error: unknown) {
      failures.set(teacherSessionId, safeError(error));
    },
    status(teacherSessionId: string) {
      return { authorized: tokens.has(teacherSessionId), error: failures.get(teacherSessionId) };
    },
  };
}
export type OAuthService = ReturnType<typeof createOAuth>;
