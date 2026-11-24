import { expect, it } from 'vitest';
import { createSessions } from '../../backend/src/security/sessions.js';
import { consumeMutation } from '../../backend/src/security/guards.js';

it('only accepts server-issued sessions on the correct role', () => {
  const sessions = createSessions();
  const session = sessions.create('teacher');
  const cookie = sessions.cookie(session);
  expect(sessions.find(cookie, 'teacher')).toBe(session);
  expect(sessions.find(cookie, 'student')).toBeUndefined();
  expect(sessions.find('teacher_session=forged', 'teacher')).toBeUndefined();
});

it('limits mutations and resets the window', () => {
  const session = createSessions().create('student');
  for (let i = 0; i < 10; i++) consumeMutation(session, 10);
  expect(() => consumeMutation(session, 20)).toThrow();
  expect(() => consumeMutation(session, 1100)).not.toThrow();
});
