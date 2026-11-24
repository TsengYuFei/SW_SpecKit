import { readConfig } from './config.js';
import { createStore } from './activity/store.js';
import { createSessions } from './security/sessions.js';
import { createListener } from './server.js';
import { createLogger } from './security/logger.js';

const config = readConfig();
const store = createStore(config.MAX_GROUPS);
const sessions = createSessions();
const teacher = createListener('teacher', store, sessions, config, {
  publicOrigin: `http://127.0.0.1:${config.TEACHER_PORT}`,
});
const student = createListener('student', store, sessions, config, {
  publicOrigin: config.STUDENT_PUBLIC_ORIGIN,
});
const log = createLogger();
for (const listener of [teacher, student]) {
  listener.server.on('error', () => {
    log({ event: 'request_failed', code: 'INTERNAL_ERROR' });
    teacher.server.close();
    student.server.close();
    process.exitCode = 1;
  });
}
teacher.server.listen(config.TEACHER_PORT, '127.0.0.1');
student.server.listen(config.STUDENT_PORT, config.STUDENT_BIND_HOST);
log({ event: 'server_started' });

function stop() {
  teacher.io.close();
  student.io.close();
  teacher.server.close();
  student.server.close();
  log({ event: 'server_stopped' });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
