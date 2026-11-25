import type { Express } from 'express';
import type { RouteContext } from '../server.js';
import type { HistoryService } from '../activity/history-service.js';
import { requireSession } from '../security/guards.js';
import { idSchema } from '@classroom/shared/schemas/common';
import { success } from '@classroom/shared/events/envelope';
export function historyRoutes(app: Express, ctx: RouteContext, history: HistoryService) {
  if (ctx.role !== 'teacher') return;
  app.get('/api/activities', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    res.json(success(history.list(session.sessionId, req.query)));
  });
  app.get('/api/activities/:id', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher'),
      detail = history.detail(session.sessionId, idSchema.parse(req.params.id));
    res.json(success(detail, detail.snapshot.revision));
  });
}
