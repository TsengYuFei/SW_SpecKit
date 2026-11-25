import { randomBytes } from 'node:crypto';
import type { GoogleGateway, TokenSet } from './sheets-client.js';
import { googleIdentitySchema, type GoogleIdentity } from '@classroom/shared/schemas/account';
import { AppError, safeError } from '../security/safe-errors.js';
import { sameSecret } from '../security/sessions.js';

export function createOAuth(
  gateway: GoogleGateway,
  clock = Date.now,
  options: { onAccount?: (identity: GoogleIdentity) => void } = {},
) {
  const pending = new Map<
    string,
    { state: string; nonce: string; expiresAt: number; generation: number }
  >();
  const tokens = new Map<string, TokenSet>();
  const accounts = new Map<string, GoogleIdentity>();
  const generations = new Map<string, number>();
  const failures = new Map<string, ReturnType<typeof safeError>>();
  const listeners = new Set<(sessionId: string, generation: number) => void>();
  const generation = (sessionId: string) => generations.get(sessionId) ?? 0;
  function advance(sessionId: string) {
    const next = generation(sessionId) + 1;
    generations.set(sessionId, next);
    for (const listener of listeners) listener(sessionId, next);
    return next;
  }
  function begin(sessionId: string) {
    const state = randomBytes(32).toString('hex'),
      nonce = randomBytes(32).toString('hex');
    const url = gateway.authorizationUrl(state, nonce);
    tokens.delete(sessionId);
    accounts.delete(sessionId);
    failures.delete(sessionId);
    const next = advance(sessionId);
    pending.set(sessionId, { state, nonce, expiresAt: clock() + 300000, generation: next });
    return url;
  }
  function assertGeneration(sessionId: string, expected: number) {
    if (generation(sessionId) !== expected) throw new AppError('GOOGLE_AUTH_REQUIRED');
  }
  async function finish(sessionId: string, state: string, code: string) {
    const entry = pending.get(sessionId);
    if (!entry || !sameSecret(entry.state, state)) throw new AppError('FORBIDDEN');
    pending.delete(sessionId);
    if (entry.expiresAt <= clock() || !code) throw new AppError('GOOGLE_AUTH_REQUIRED');
    const credentials = await gateway.exchange(code);
    if (!credentials.access_token) throw new AppError('GOOGLE_AUTH_REQUIRED');
    const identity = gateway.verifiedIdentity
      ? googleIdentitySchema.parse(await gateway.verifiedIdentity(credentials, entry.nonce))
      : undefined;
    assertGeneration(sessionId, entry.generation);
    if (identity) options.onAccount?.(identity);
    tokens.set(sessionId, credentials);
    if (identity) accounts.set(sessionId, identity);
    failures.delete(sessionId);
    advance(sessionId);
  }
  function credentials(sessionId: string) {
    const value = tokens.get(sessionId);
    if (!value) throw new AppError('GOOGLE_AUTH_REQUIRED');
    return value;
  }
  function account(sessionId: string) {
    credentials(sessionId);
    const identity = accounts.get(sessionId);
    if (!identity) throw new AppError('GOOGLE_AUTH_REQUIRED');
    return { ...identity };
  }
  return {
    begin,
    finish,
    credentials,
    account,
    generation,
    assertGeneration,
    onChange(listener: (sessionId: string, generation: number) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect(sessionId: string) {
      pending.delete(sessionId);
      tokens.delete(sessionId);
      accounts.delete(sessionId);
      failures.delete(sessionId);
      advance(sessionId);
    },
    failed(sessionId: string, error: unknown, expectedGeneration?: number) {
      if (expectedGeneration === undefined || generation(sessionId) === expectedGeneration)
        failures.set(sessionId, safeError(error));
    },
    status(sessionId: string) {
      const identity = accounts.get(sessionId);
      return {
        authorized: tokens.has(sessionId),
        authGeneration: generation(sessionId),
        account: identity ? { displayName: identity.displayName, email: identity.email } : null,
        error: failures.get(sessionId),
      };
    },
  };
}
export type OAuthService = ReturnType<typeof createOAuth>;
