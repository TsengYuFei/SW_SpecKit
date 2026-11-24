import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from '@classroom/shared/schemas/common';

export interface BrowserSession {
  sessionId: string;
  role: Role;
  activityId: string | null;
  csrfToken: string;
  windowStart: number;
  mutationCount: number;
}

export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessions() {
  const sessions = new Map<string, BrowserSession>();
  function find(cookie: string | undefined, role: Role) {
    const pair = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${role}_session=`));
    const id = pair?.slice(`${role}_session=`.length);
    const session = id ? sessions.get(id) : undefined;
    return session?.role === role ? session : undefined;
  }
  function create(role: Role): BrowserSession {
    const session = {
      sessionId: randomBytes(32).toString('hex'),
      role,
      activityId: null,
      csrfToken: randomBytes(32).toString('hex'),
      windowStart: 0,
      mutationCount: 0,
    };
    sessions.set(session.sessionId, session);
    return session;
  }
  function cookie(session: BrowserSession) {
    const sameSite = session.role === 'teacher' ? 'Lax' : 'Strict';
    return `${session.role}_session=${session.sessionId}; Path=/; HttpOnly; SameSite=${sameSite}`;
  }
  return { find, create, cookie };
}
export type Sessions = ReturnType<typeof createSessions>;
