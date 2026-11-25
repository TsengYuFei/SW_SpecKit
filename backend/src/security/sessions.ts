import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from '@classroom/shared/schemas/common';
import type { ParticipationRepository } from '../persistence/participation-repository.js';
import { participantDigest } from './participants.js';

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

export function createSessions(participation?: ParticipationRepository) {
  const sessions = new Map<string, BrowserSession>();
  const cookieTokens = new WeakMap<BrowserSession, string>();
  function runtimeSession(role: Role, sessionId: string, token: string): BrowserSession {
    const session = {
      sessionId,
      role,
      activityId: null,
      csrfToken: randomBytes(32).toString('hex'),
      windowStart: 0,
      mutationCount: 0,
    };
    sessions.set(sessionId, session);
    cookieTokens.set(session, token);
    return session;
  }
  function find(cookie: string | undefined, role: Role) {
    const pair = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${role}_session=`));
    const id = pair?.slice(`${role}_session=`.length);
    if (role === 'student' && participation) {
      if (!id || !/^[a-f0-9]{64}$/.test(id)) return undefined;
      const participant = participation.findParticipant(participantDigest(id));
      if (!participant) return undefined;
      return sessions.get(participant.id) ?? runtimeSession(role, participant.id, id);
    }
    const session = id ? sessions.get(id) : undefined;
    return session?.role === role ? session : undefined;
  }
  function create(role: Role): BrowserSession {
    const token = randomBytes(32).toString('hex');
    const sessionId =
      role === 'student' && participation
        ? participation.transaction(() => participation.participant(participantDigest(token))).id
        : token;
    return runtimeSession(role, sessionId, token);
  }
  function cookie(session: BrowserSession) {
    const sameSite = session.role === 'teacher' ? 'Lax' : 'Strict';
    const persistent = session.role === 'student' && participation ? '; Max-Age=31536000' : '';
    return `${session.role}_session=${cookieTokens.get(session) ?? session.sessionId}; Path=/; HttpOnly; SameSite=${sameSite}${persistent}`;
  }
  return { find, create, cookie };
}
export type Sessions = ReturnType<typeof createSessions>;
