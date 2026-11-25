import { createListener } from '../../backend/src/server.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { createSourceModule } from '../../backend/src/source-module.js';
import { readConfig } from '../../backend/src/config.js';
import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { createPersistenceFixture, type PersistenceFixture } from './persistence.js';
import { googleAccounts } from '../fixtures/google-accounts.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { listen, close } from './server.js';

export async function catalogServer(
  role: 'teacher' | 'student' = 'teacher',
  provided?: PersistenceFixture,
  ports: { teacher?: number; student?: number } = {},
) {
  const persistence = provided ?? createPersistenceFixture();
  const config = readConfig({
    GOOGLE_CLIENT_ID: 'invalid-demo-id',
    GOOGLE_CLIENT_SECRET: 'invalid-demo-value',
    DATABASE_PATH: persistence.databasePath,
  });
  const store = createStore(config.MAX_GROUPS),
    sessions = createSessions(persistence.participation);
  const grid = sampleSheet(17);
  const gateway: GoogleGateway = {
    authorizationUrl: (state, nonce) =>
      '/fake-google?state=' +
      encodeURIComponent(state) +
      '&nonce=' +
      encodeURIComponent(nonce ?? ''),
    exchange: async (code) => ({ access_token: 'invalid-demo-token', id_token: code }),
    verifiedIdentity: async (credentials) =>
      credentials.id_token === 'owner-b' ? googleAccounts.b : googleAccounts.a,
    listSpreadsheets: async (_credentials, input) => ({
      items: [
        { id: 'source-one', name: '教材一', canEdit: true },
        { id: 'source-two', name: '教材二', canEdit: false },
      ].filter((file) => file.name.includes(input.query)),
      nextPageToken: null,
      incompleteSearch: false,
    }),
    getFileCapability: async (id) => ({
      id,
      name: id === 'source-one' ? '教材一' : '教材二',
      canEdit: id === 'source-one',
    }),
    readFirstSheet: async () => ({ spreadsheetTitle: '教材一', sheet: structuredClone(grid) }),
    readSheetById: async (_id, sheetId) =>
      sheetId === 17 ? structuredClone(grid) : sampleSheet(sheetId),
    read: async () => [structuredClone(grid)],
    write: async (_id, _credentials, updates) => {
      for (const { target, answer } of updates) {
        if (target.sheetId !== 17) throw new Error('合成來源不存在');
        grid.rows[target.rowIndex] ??= [];
        grid.rows[target.rowIndex]![target.columnIndex] = {
          userEnteredValue: { stringValue: answer },
        };
      }
    },
  };
  const module = createSourceModule(config, store, gateway, persistence);
  const student = createListener('student', store, sessions, config, {
    registerRoutes: module.registerRoutes,
    authorizeTeacher: module.authorizeTeacher,
  });
  const studentUrl = await listen(student.server, '127.0.0.1', ports.student ?? 0);
  config.STUDENT_PUBLIC_ORIGIN = studentUrl;
  const teacher = createListener(role, store, sessions, config, {
    authorizeTeacher: module.authorizeTeacher,
    registerRoutes(app, ctx) {
      module.registerRoutes(app, ctx);
      if (role === 'teacher')
        app.get('/fake-google', (req, res) =>
          res.redirect(
            '/api/google/callback?state=' +
              encodeURIComponent(String(req.query.state)) +
              '&code=owner-a',
          ),
        );
    },
  });
  const url = await listen(teacher.server, '127.0.0.1', ports.teacher ?? 0);
  async function client(owner = 'owner-a') {
    const session = await fetch(url + '/api/session');
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
    const data = (await session.json()).data;
    const headers = { cookie, 'x-csrf-token': data.csrfToken, 'content-type': 'application/json' };
    const post = (path: string, body: unknown) =>
      fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const get = (path: string) => fetch(url + path, { headers: { cookie } });
    async function connect(account: string) {
      const started = await post('/api/google/connect', {});
      const result = await started.json();
      if (!result.ok) throw new Error('無法建立合成授權');
      const state = new URL(result.data.url, url).searchParams.get('state')!;
      return fetch(
        url + '/api/google/callback?state=' + encodeURIComponent(state) + '&code=' + account,
        { headers: { cookie }, redirect: 'manual' },
      );
    }
    await connect(owner);
    return { get, post, connect, cookie, csrfToken: data.csrfToken, headers };
  }
  return {
    ...module,
    url,
    studentUrl,
    store,
    sessions,
    gateway,
    persistence,
    client,
    async stop(preserveDatabase = false) {
      await module.worker?.stop();
      teacher.io.disconnectSockets(true);
      student.io.disconnectSockets(true);
      await Promise.all([close(teacher.server), close(student.server)]);
      if (preserveDatabase) persistence.connection.close();
      else persistence.close();
    },
  };
}
