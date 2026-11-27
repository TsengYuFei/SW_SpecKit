import type { Express } from 'express';
import { z } from 'zod';
import type { RouteContext } from '../server.js';
import type { ResultExportService } from '../activity/result-export-service.js';
import { requireSession, requireCsrf } from '../security/guards.js';
import { ExportGateError } from '../export/export-gate.js';
import { AppError } from '../security/safe-errors.js';
export function resultExportRoutes(app: Express, ctx: RouteContext, service: ResultExportService) {
  if (ctx.role !== 'teacher') return;
  app.head('/api/activities/:id/export.csv', (_req, res) => {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
  });
  app.get('/api/activities/:id/export.csv', async (req, res, next) => {
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', abort);
    try {
      const session = requireSession(ctx.sessions, req, 'teacher');
      requireCsrf(req, session);
      const id = z.uuid().parse(req.params.id);
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)
        throw new AppError('INVALID_INPUT');
      z.strictObject({}).parse(req.query);
      z.strictObject({}).parse(req.body ?? {});
      const result = await service.download(session.sessionId, id, controller.signal);
      if (controller.signal.aborted || res.destroyed) return;
      service.checkScope(result.scope);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', result.disposition);
      res.setHeader('Content-Length', result.bytes.length);
      // end avoids Express send() synthesizing ETag or converting conditionals into 304 responses.
      res.status(200).end(result.bytes);
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      if (error instanceof ExportGateError) res.setHeader('Retry-After', error.retryAfter);
      next(error);
    } finally {
      res.off('close', abort);
    }
  });
}
