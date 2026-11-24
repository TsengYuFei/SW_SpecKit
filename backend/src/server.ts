import express, { type Express, type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { TRANSPORT_LIMIT } from '@classroom/shared/limits';
import type { Role } from '@classroom/shared/schemas/common';
import type { Config } from './config.js';
import type { ActivityStore } from './activity/store.js';
import type { Sessions } from './security/sessions.js';
import { checkOrigin, consumeMutation, requireCsrf, requireSession } from './security/guards.js';
import { normalizeError, safeError } from './security/safe-errors.js';
import { sessionRoutes } from './http/session-routes.js';
import { attachActivityHandlers } from './sockets/activity-handlers.js';

export interface RouteContext {
  role: Role;
  store: ActivityStore;
  sessions: Sessions;
  config: Config;
}
interface Options {
  publicOrigin?: string;
  registerRoutes?: (app: Express, context: RouteContext) => void;
}

export function createListener(
  role: Role,
  store: ActivityStore,
  sessions: Sessions,
  config: Config,
  options: Options = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      checkOrigin(req, options.publicOrigin);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(express.json({ limit: TRANSPORT_LIMIT }));
  sessionRoutes(app, role, store, sessions, config.STUDENT_PUBLIC_ORIGIN);
  app.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      try {
        const session = requireSession(sessions, req, role);
        requireCsrf(req, session);
        consumeMutation(session);
      } catch (error) {
        next(error);
        return;
      }
    }
    next();
  });
  options.registerRoutes?.(app, { role, store, sessions, config });
  const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  app.use(express.static(dist, { index: false }));
  app.get(['/', '/student/:id'], (_req, res) => res.sendFile('index.html', { root: dist }));
  app.use((_req, res) =>
    res.status(404).json({
      ok: false,
      error: { code: 'ACTIVITY_UNAVAILABLE', message: '此頁面或活動不可用。', retryable: false },
      revision: 0,
    }),
  );
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const normalized = normalizeError(error);
    res
      .status(normalized.status)
      .json({ ok: false, error: safeError(normalized), revision: store.activity?.revision ?? 0 });
  };
  app.use(handleError);
  const server = createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: TRANSPORT_LIMIT,
    allowRequest(req, callback) {
      try {
        checkOrigin(req, options.publicOrigin, true);
        requireSession(sessions, req, role);
        callback(null, true);
      } catch {
        callback('Forbidden', false);
      }
    },
  });
  io.use((socket, next) => {
    try {
      socket.data.session = requireSession(sessions, socket.request, role);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  attachActivityHandlers(io, store, sessions, role);
  return { app, server, io };
}
