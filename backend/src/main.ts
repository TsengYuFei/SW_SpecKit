import { readConfig } from './config.js';
import { createStore } from './activity/store.js';
import { createSessions } from './security/sessions.js';
import { createListener } from './server.js';
import { createLogger } from './security/logger.js';
import { createSourceModule } from './source-module.js';
import { resolve } from 'node:path';
import { openDatabase } from './persistence/connection.js';
import { createRepositories } from './persistence/repositories.js';
import { createGoogleGateway } from './google/sheets-client.js';
import { safeError } from './security/safe-errors.js';

function start() {
  const config = readConfig();
  const store = createStore(config.MAX_GROUPS);
  const connection = openDatabase(resolve(config.DATABASE_PATH));
  const persistence = { connection, ...createRepositories(connection, config.MAX_GROUPS) };
  const sessions = createSessions(persistence.participation);
  const source = createSourceModule(config, store, createGoogleGateway(config), persistence);
  const teacher = createListener('teacher', store, sessions, config, {
    publicOrigin: `http://127.0.0.1:${config.TEACHER_PORT}`,
    registerRoutes: source.registerRoutes,
    authorizeTeacher: source.authorizeTeacher,
  });
  const student = createListener('student', store, sessions, config, {
    publicOrigin: config.STUDENT_PUBLIC_ORIGIN,
    registerRoutes: source.registerRoutes,
    authorizeTeacher: source.authorizeTeacher,
  });
  const log = createLogger();
  for (const listener of [teacher, student]) {
    listener.server.on('error', () => {
      log({ event: 'request_failed', code: 'INTERNAL_ERROR' });
      stop();
      process.exitCode = 1;
    });
  }
  teacher.server.listen(config.TEACHER_PORT, '127.0.0.1');
  student.server.listen(config.STUDENT_PORT, config.STUDENT_BIND_HOST);
  log({ event: 'server_started' });

  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    void Promise.all([
      source.worker?.stop(),
      ...[teacher, student].map(
        (listener) => new Promise<void>((done) => listener.io.close(() => done())),
      ),
    ])
      .then(() => {
        connection.close();
        log({ event: 'server_stopped' });
      })
      .catch(() => {
        log({ event: 'request_failed', code: 'STORAGE_UNAVAILABLE' });
        process.exitCode = 1;
      });
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
try {
  start();
} catch (error) {
  createLogger()({ event: 'request_failed', code: safeError(error).code });
  process.exitCode = 1;
}
