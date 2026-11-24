import type { Express } from 'express';
import type { RouteContext } from './server.js';
import type { Config } from './config.js';
import type { ActivityStore } from './activity/store.js';
import { createGoogleGateway, type GoogleGateway } from './google/sheets-client.js';
import { createOAuth } from './google/oauth.js';
import { createSourceService } from './activity/source-service.js';
import { googleRoutes } from './http/google-routes.js';
import { activityRoutes } from './http/activity-routes.js';
import { sourceRoutes } from './http/source-routes.js';

export function createSourceModule(
  config: Config,
  store: ActivityStore,
  gateway: GoogleGateway = createGoogleGateway(config),
) {
  const oauth = createOAuth(gateway);
  const source = createSourceService(store, oauth, gateway, config);
  return {
    oauth,
    source,
    registerRoutes(app: Express, ctx: RouteContext) {
      googleRoutes(app, ctx, oauth);
      activityRoutes(app, ctx);
      sourceRoutes(app, ctx, source);
    },
  };
}
