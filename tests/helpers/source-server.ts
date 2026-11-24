import { createListener } from '../../backend/src/server.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { createSourceModule } from '../../backend/src/source-module.js';
import { readConfig } from '../../backend/src/config.js';
import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { close, listen } from './server.js';
import { googleReadDouble } from './google-adapter.js';

export function fakeGateway(): GoogleGateway {
  const reader = googleReadDouble(async () => [sampleSheet(), sampleSheet(12, 5, 2)]);
  return {
    authorizationUrl: (state) => `/fake-google?state=${state}`,
    exchange: async () => ({ access_token: 'invalid-demo-token' }),
    read: reader.read,
    write: async () => {
      throw new Error('來源測試不得回寫');
    },
  };
}

export async function sourceServer(role: 'teacher' | 'student' = 'teacher') {
  const config = readConfig({
    GOOGLE_CLIENT_ID: 'invalid-demo-id',
    GOOGLE_CLIENT_SECRET: 'invalid-demo-value',
  });
  const store = createStore(config.MAX_GROUPS);
  const sessions = createSessions();
  const gateway = fakeGateway();
  const source = createSourceModule(config, store, gateway);
  const listener = createListener(role, store, sessions, config, {
    registerRoutes(app, ctx) {
      source.registerRoutes(app, ctx);
      if (role === 'teacher')
        app.get('/fake-google', (req, res) =>
          res.redirect(
            `/api/google/callback?state=${encodeURIComponent(String(req.query.state))}&code=demo`,
          ),
        );
    },
  });
  return {
    ...source,
    gateway,
    store,
    url: await listen(listener.server),
    async stop() {
      listener.io.disconnectSockets(true);
      await close(listener.server);
    },
  };
}
