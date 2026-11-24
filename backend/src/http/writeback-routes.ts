import type { Express } from 'express';
import { z } from 'zod';
import { idSchema } from '@classroom/shared/schemas/common';
import { success } from '@classroom/shared/events/envelope';
import type { RouteContext } from '../server.js';
import type { createWritebackService } from '../google/writeback-service.js';
import { requireSession } from '../security/guards.js';

export function writebackRoutes(
  app: Express,
  ctx: RouteContext,
  service: ReturnType<typeof createWritebackService>,
) {
  if (ctx.role !== 'teacher') return;
  const base = '/api/activities/:id/writeback';
  app.post(base, (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    const id = idSchema.parse(req.params.id);
    const { requestId } = z.strictObject({ requestId: idSchema }).parse(req.body);
    const result = service.start(id, session.sessionId, requestId);
    res.json(success(result, ctx.store.requireActivity(id).revision));
  });
  app.get(`${base}/:op`, (req, res) => {
    requireSession(ctx.sessions, req, 'teacher');
    const id = idSchema.parse(req.params.id);
    res.json(
      success(
        service.get(id, idSchema.parse(req.params.op)),
        ctx.store.requireActivity(id).revision,
      ),
    );
  });
  app.post(`${base}/:op/verify`, async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    z.strictObject({}).parse(req.body);
    const id = idSchema.parse(req.params.id);
    const result = await service.verify(id, idSchema.parse(req.params.op), session.sessionId);
    res.json(success(result, ctx.store.requireActivity(id).revision));
  });
}
