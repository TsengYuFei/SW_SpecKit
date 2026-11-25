import type { Express } from 'express';
import type { Role } from '@classroom/shared/schemas/common';
import { success } from '@classroom/shared/events/envelope';
import type { ActivityStore } from '../activity/store.js';
import type { Sessions } from '../security/sessions.js';
import type { TeacherAuthorization } from '../security/guards.js';
import { AppError } from '../security/safe-errors.js';

export function sessionRoutes(
  app: Express,
  role: Role,
  store: ActivityStore,
  sessions: Sessions,
  studentOrigin?: string,
  authorizeTeacher?: TeacherAuthorization,
) {
  app.get('/api/health', (_req, res) =>
    res.json(success({ bootId: store.bootId, available: true })),
  );
  app.get('/api/session', (req, res) => {
    const session = sessions.find(req.headers.cookie, role) ?? sessions.create(role);
    res.setHeader('Set-Cookie', sessions.cookie(session));
    const data = { role, csrfToken: session.csrfToken, bootId: store.bootId };
    let currentActivityId = store.activity?.id ?? null,
      authGeneration = 0,
      authorized = false;
    if (role === 'teacher' && authorizeTeacher) {
      try {
        const auth = authorizeTeacher(session);
        authGeneration = auth.authGeneration;
        authorized = true;
        currentActivityId =
          store.activity?.ownerAccountId === auth.accountId ? store.activity.id : null;
      } catch (error) {
        if (
          !(error instanceof AppError) ||
          !['GOOGLE_AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code)
        )
          throw error;
        currentActivityId = null;
      }
    }
    const teacherData = { ...data, currentActivityId, studentOrigin, authGeneration, authorized };
    const visibleRevision =
      role === 'teacher' && currentActivityId ? (store.activity?.revision ?? 0) : 0;
    res.json(success(role === 'teacher' ? teacherData : data, visibleRevision));
  });
}
