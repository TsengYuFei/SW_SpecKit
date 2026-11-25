import type { Express } from 'express';
import type { RouteContext } from './server.js';
import type { Config } from './config.js';
import type { ActivityStore } from './activity/store.js';
import { createGoogleGateway, type GoogleGateway } from './google/sheets-client.js';
import { createOAuth } from './google/oauth.js';
import { createSourceService } from './activity/source-service.js';
import { googleRoutes } from './http/google-routes.js';
import { activityRoutes, catalogActivityRoutes } from './http/activity-routes.js';
import { sourceRoutes, catalogSourceRoutes } from './http/source-routes.js';
import { createWritebackService } from './google/writeback-service.js';
import { writebackRoutes, durableWritebackRoutes } from './http/writeback-routes.js';
import type { RuntimePersistence } from './persistence/repositories.js';
import { createCatalogService } from './activity/catalog-service.js';
import { requireSession } from './security/guards.js';
import { invalidateTeacherSubscriptions } from './sockets/activity-handlers.js';
import { createPersistentCommands } from './activity/persistent-commands.js';
import { createWritebackWorker } from './google/writeback-worker.js';
import { createDurableWritebackService } from './google/durable-writeback-service.js';
import { readPersistentActivity } from './activity/persistent-store.js';
import { publishActivity } from './sockets/activity-handlers.js';

export function createSourceModule(
  config: Config,
  store: ActivityStore,
  gateway: GoogleGateway = createGoogleGateway(config),
  persistence?: RuntimePersistence,
) {
  const oauth = createOAuth(gateway, Date.now, {
    onAccount: (identity) => {
      persistence?.connection.transaction(() =>
        persistence.accounts.upsert({
          accountId: identity.sub,
          displayEmail: identity.email,
          displayName: identity.displayName,
        }),
      );
    },
  });
  const catalog = persistence
    ? createCatalogService(store, oauth, gateway, config, persistence)
    : undefined;
  catalog?.restoreCurrent();
  const worker = persistence
    ? createWritebackWorker(persistence, gateway, (owner) => oauth.forOwner(owner), {
        changed: (id) => {
          if (store.activity?.id === id) {
            Object.assign(store.activity, readPersistentActivity(persistence, store, id));
            publishActivity(store);
          }
        },
      })
    : undefined;
  const durableWriteback =
    persistence && catalog && worker
      ? createDurableWritebackService(persistence, worker, (sessionId, id) =>
          catalog.authorize(sessionId, id),
        )
      : undefined;
  if (catalog && persistence)
    store.bindCommands(
      createPersistentCommands(
        store,
        persistence,
        (session, id) => catalog.authorize(session.sessionId, id),
        () => worker?.wake(),
      ),
    );
  oauth.onChange((sessionId, generation) =>
    invalidateTeacherSubscriptions(store, sessionId, generation),
  );
  oauth.onChange((sessionId) => {
    try {
      worker?.wakeOwner(oauth.account(sessionId).sub);
    } catch {
      /* Authorization is not yet available. */
    }
  });
  const source = createSourceService(store, oauth, gateway, config);
  const writeback = persistence
    ? undefined
    : createWritebackService(
        store,
        {
          credentials: (sessionId) => {
            if (catalog) catalog.authorize(sessionId, store.activity?.id);
            return oauth.credentials(sessionId);
          },
        },
        gateway,
      );
  return {
    oauth,
    source,
    writeback,
    worker,
    durableWriteback,
    catalog,
    authorizeTeacher: catalog
      ? (session: import('./security/sessions.js').BrowserSession, id?: string) =>
          catalog.authorize(session.sessionId, id)
      : undefined,
    registerRoutes(app: Express, ctx: RouteContext) {
      googleRoutes(app, ctx, oauth, Boolean(catalog));
      if (catalog) {
        catalogActivityRoutes(app, ctx, catalog);
        catalogSourceRoutes(app, ctx, catalog);
        if (ctx.role === 'teacher')
          app.use('/api/activities/:id/writeback', (req, _res, next) => {
            try {
              const session = requireSession(ctx.sessions, req, 'teacher');
              catalog.authorize(session.sessionId, String(req.params.id));
              next();
            } catch (error) {
              next(error);
            }
          });
      } else {
        // Standalone v1 fixtures retain their existing flow until each subsequent story migrates it.
        // Production main always provides persistence, so these endpoints are never registered there.
        activityRoutes(app, ctx);
        sourceRoutes(app, ctx, source);
      }
      if (durableWriteback) durableWritebackRoutes(app, ctx, durableWriteback);
      else if (writeback) writebackRoutes(app, ctx, writeback);
    },
  };
}
