import type { Express } from 'express';
import { z } from 'zod';
import { success } from '@classroom/shared/events/envelope';
import { groupCountSchema, idSchema } from '@classroom/shared/schemas/common';
import type { RouteContext } from '../server.js';
import { sourcePreview } from '../activity/source-service.js';
import { requireSession } from '../security/guards.js';
import type { CatalogService } from '../activity/catalog-service.js';

export function catalogActivityRoutes(app: Express, ctx: RouteContext, catalog: CatalogService) {
  if (ctx.role !== 'teacher') return;
  app.post('/api/activities', async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    const result = await catalog.create(session.sessionId, req.body);
    res.json(success(result, ctx.store.activity?.revision ?? 0));
  });
  app.get('/api/activities/:id', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    const result = catalog.get(session.sessionId, idSchema.parse(req.params.id));
    res.json(success(result, ctx.store.activity?.revision ?? 0));
  });
}

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
