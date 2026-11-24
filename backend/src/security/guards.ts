import type { IncomingMessage } from 'node:http';
import type { Role } from '@classroom/shared/schemas/common';
import { AppError } from './safe-errors.js';
import { sameSecret, type BrowserSession, type Sessions } from './sessions.js';

export function expectedOrigin(req: IncomingMessage, configured?: string) {
  return configured ?? `http://127.0.0.1:${req.socket.localPort}`;
}

export function checkOrigin(req: IncomingMessage, configured?: string, requireOrigin = false) {
  const origin = expectedOrigin(req, configured);
  if (
    req.headers.host !== new URL(origin).host ||
    (req.headers.origin !== undefined && req.headers.origin !== origin) ||
    (requireOrigin && req.headers.origin !== origin)
  )
    throw new AppError('FORBIDDEN');
}

export function requireSession(sessions: Sessions, req: IncomingMessage, role: Role) {
  const session = sessions.find(req.headers.cookie, role);
  if (!session) throw new AppError('UNAUTHORIZED');
  return session;
}

export function consumeMutation(session: BrowserSession, now = performance.now()) {
  if (now - session.windowStart >= 1000) {
    session.windowStart = now;
    session.mutationCount = 0;
  }
  session.mutationCount++;
  if (session.mutationCount > 10) throw new AppError('RATE_LIMITED');
}

export function requireCsrf(req: IncomingMessage, session: BrowserSession) {
  const token = req.headers['x-csrf-token'];
  if (typeof token !== 'string' || !sameSecret(token, session.csrfToken))
    throw new AppError('FORBIDDEN');
}
