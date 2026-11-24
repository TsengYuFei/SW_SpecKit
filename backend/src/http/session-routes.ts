import type { Express } from 'express';
import type { Role } from '@classroom/shared/schemas/common';
import { success } from '@classroom/shared/events/envelope';
import type { ActivityStore } from '../activity/store.js';
import type { Sessions } from '../security/sessions.js';

export function sessionRoutes(app: Express, role: Role, store: ActivityStore, sessions: Sessions) {
  app.get('/api/health', (_req, res) =>
    res.json(success({ bootId: store.bootId, available: true })),
  );
  app.get('/api/session', (req, res) => {
    const session = sessions.find(req.headers.cookie, role) ?? sessions.create(role);
    res.setHeader('Set-Cookie', sessions.cookie(session));
    const data = { role, csrfToken: session.csrfToken, bootId: store.bootId };
    const teacherData = { ...data, currentActivityId: store.activity?.id ?? null };
    res.json(success(role === 'teacher' ? teacherData : data, store.activity?.revision ?? 0));
  });
}
