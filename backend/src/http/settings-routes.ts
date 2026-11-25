import type { Express } from 'express';
import type { RouteContext } from '../server.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import { saveSettingsSchema } from '@classroom/shared/schemas/settings';
import { z } from 'zod';
import { success } from '@classroom/shared/events/envelope';
import { requireSession, type TeacherAuthorization } from '../security/guards.js';
export function settingsRoutes(
  app: Express,
  ctx: RouteContext,
  p: RuntimePersistence,
  authorize: TeacherAuthorization,
) {
  if (ctx.role !== 'teacher') return;
  app.get('/api/settings', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher'),
      auth = authorize(session);
    res.json(success(p.accounts.settings(auth.accountId)));
  });
  app.post('/api/settings', (req, res) => {
    const session = requireSession(ctx.sessions, req, 'teacher'),
      auth = authorize(session);
    const body = saveSettingsSchema
      .extend({ defaultGroupCount: z.number().int().min(1).max(ctx.config.MAX_GROUPS) })
      .parse(req.body);
    const result = p.commands.execute(
      {
        ownerAccountId: auth.accountId,
        event: 'settings:save',
        requestId: body.requestId,
        payload: { defaultGroupCount: body.defaultGroupCount },
      },
      () => p.accounts.saveSettings(auth.accountId, { defaultGroupCount: body.defaultGroupCount }),
    );
    res.json(success(result));
  });
}
