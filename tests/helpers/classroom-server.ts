import { catalogClassroom } from './activity.js';
import type { PersistenceFixture } from './persistence.js';

export async function classroomServer(persistence?: PersistenceFixture) {
  const c = await catalogClassroom(persistence);
  return {
    ...c,
    teacherUrl: c.server.url,
    studentUrl: c.server.studentUrl,
    stop: () => c.server.stop(),
  };
}
