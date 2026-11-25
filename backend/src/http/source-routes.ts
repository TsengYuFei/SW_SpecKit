import type { Express } from 'express';
import { z } from 'zod';
import { success } from '@classroom/shared/events/envelope';
import { idSchema } from '@classroom/shared/schemas/common';
import type { RouteContext } from '../server.js';
import type { createSourceService } from '../activity/source-service.js';
import { requireSession } from '../security/guards.js';
import type { CatalogService } from '../activity/catalog-service.js';

export function catalogSourceRoutes(app: Express, ctx: RouteContext, catalog: CatalogService) {
  if (ctx.role !== 'teacher') return;
  app.get('/api/google/spreadsheets', async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    res.json(success(await catalog.list(session.sessionId, req.query)));
  });
  app.post('/api/source-previews', async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    res.json(success(await catalog.preview(session.sessionId, req.body)));
  });
}

export function sourceRoutes(
  app: Express,
  ctx: RouteContext,
  source: ReturnType<typeof createSourceService>,
) {
  if (ctx.role !== 'teacher') return;
  app.post('/api/activities/:id/source', async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    const id = idSchema.parse(req.params.id);
    const body = z
      .strictObject({ spreadsheetUrlOrId: z.string().trim().min(1).max(2048) })
      .parse(req.body);
    const preview = await source.load(id, session.sessionId, body.spreadsheetUrlOrId);
    res.json(success(preview, ctx.store.requireActivity(id).revision));
  });
  app.post('/api/activities/:id/source/confirm', (req, res) => {
    requireSession(ctx.sessions, req, 'teacher');
    const id = idSchema.parse(req.params.id);
    const body = z.strictObject({ mappingVersion: z.number().int().positive() }).parse(req.body);
    const result = source.confirm(id, body.mappingVersion);
    res.json(success(result, ctx.store.requireActivity(id).revision));
  });
}
