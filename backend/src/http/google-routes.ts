import type { Express } from 'express';
import { z } from 'zod';
import { success } from '@classroom/shared/events/envelope';
import type { RouteContext } from '../server.js';
import type { OAuthService } from '../google/oauth.js';
import { requireSession } from '../security/guards.js';

export function googleRoutes(app: Express, ctx: RouteContext, oauth: OAuthService) {
  if (ctx.role !== 'teacher') return;
  app.get('/api/google/status', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    res.json(
      success({
        ...oauth.status(session.sessionId),
        configured: Boolean(ctx.config.GOOGLE_CLIENT_ID && ctx.config.GOOGLE_CLIENT_SECRET),
      }),
    );
  });
  app.post('/api/google/start', (req, res) => {
    z.strictObject({}).parse(req.body ?? {});
    const session = requireSession(ctx.sessions, req, 'teacher');
    res.json(success({ url: oauth.begin(session.sessionId) }));
  });
  app.get('/api/google/callback', async (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher');
    try {
      await oauth.finish(
        session.sessionId,
        typeof req.query.state === 'string' ? req.query.state : '',
        typeof req.query.code === 'string' ? req.query.code : '',
      );
    } catch (error) {
      oauth.failed(session.sessionId, error);
    }
    res.redirect('/');
  });
}
