import type { Express } from 'express';
import { z } from 'zod';
import { success } from '@classroom/shared/events/envelope';
import { groupCountSchema, idSchema } from '@classroom/shared/schemas/common';
import type { RouteContext } from '../server.js';
import { sourcePreview } from '../activity/source-service.js';
import { requireSession } from '../security/guards.js';

export function activityRoutes(app: Express, ctx: RouteContext) {
  if (ctx.role !== 'teacher') return;
  app.post('/api/activities', (req, res) => {
    requireSession(ctx.sessions, req, 'teacher');
    const { groupCount } = z.strictObject({ groupCount: groupCountSchema }).parse(req.body);
    const activity = ctx.store.createActivity(groupCount);
    res.json(success(sourcePreview(activity), activity.revision));
  });
  app.get('/api/activities/:id', (req, res) => {
    requireSession(ctx.sessions, req, 'teacher');
    const activity = ctx.store.requireActivity(idSchema.parse(req.params.id));
    res.json(success(sourcePreview(activity), activity.revision));
  });
}
