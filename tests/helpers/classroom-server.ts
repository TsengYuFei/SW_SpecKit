import { createListener } from '../../backend/src/server.js';
import { createSourceModule } from '../../backend/src/source-module.js';
import { readConfig } from '../../backend/src/config.js';
import { classroom } from './activity.js';
import { fakeGateway } from './source-server.js';
import { close, listen } from './server.js';

export async function classroomServer() {
  const c = classroom();
  const config = readConfig({});
  const source = createSourceModule(config, c.store, fakeGateway());
  const student = createListener('student', c.store, c.sessions, config);
  const studentUrl = await listen(student.server);
  config.STUDENT_PUBLIC_ORIGIN = studentUrl;
  const teacher = createListener('teacher', c.store, c.sessions, config, {
    registerRoutes: source.registerRoutes,
  });
  return {
    ...c,
    teacherUrl: await listen(teacher.server),
    studentUrl,
    async stop() {
      teacher.io.disconnectSockets(true);
      student.io.disconnectSockets(true);
      await close(teacher.server);
      await close(student.server);
    },
  };
}
