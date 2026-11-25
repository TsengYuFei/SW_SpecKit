import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPersistenceFixture } from '../helpers/persistence.js';
import { createSessions } from '../../backend/src/security/sessions.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('restores the original anonymous identity from a digest without saving cookie or CSRF values', () => {
  const fixture = createPersistenceFixture();
  cleanups.push(fixture.close);
  const sessions = createSessions(fixture.participation);
  const student = sessions.create('student');
  const cookie = sessions.cookie(student).split(';')[0]!;
  expect(sessions.cookie(student)).toContain('Max-Age=31536000');
  fixture.connection.close();
  const reopened = createPersistenceFixture(fixture.directory);
  cleanups.push(reopened.close);
  const restored = createSessions(reopened.participation).find(cookie, 'student')!;
  expect(restored.sessionId).toBe(student.sessionId);
  expect(restored.csrfToken).not.toBe(student.csrfToken);
  expect(
    createSessions(reopened.participation).find('student_session=untrusted', 'student'),
  ).toBeUndefined();
  reopened.connection.close();
  const data = readFileSync(reopened.databasePath).toString('latin1');
  expect(data).not.toContain(cookie.split('=')[1]!);
  expect(data).not.toContain(student.csrfToken);
});

it('never restores a teacher session or accepts a student cookie as a teacher', () => {
  const fixture = createPersistenceFixture();
  cleanups.push(fixture.close);
  const sessions = createSessions(fixture.participation);
  const teacher = sessions.create('teacher');
  const student = sessions.create('student');
  const fresh = createSessions(fixture.participation);
  expect(fresh.find(sessions.cookie(teacher), 'teacher')).toBeUndefined();
  expect(fresh.find(sessions.cookie(student), 'teacher')).toBeUndefined();
  expect(sessions.cookie(teacher)).not.toContain('Max-Age');
});
