import { describe, expect, it } from 'vitest';
import { readConfig } from '../../backend/src/config.js';

describe('runtime configuration', () => {
  it('starts without credentials and uses local defaults', () => {
    expect(readConfig({})).toMatchObject({
      TEACHER_PORT: 3000,
      STUDENT_PORT: 3001,
      MAX_GROUPS: 100,
    });
  });
  it('rejects invalid ports without exposing input', () => {
    expect(() => readConfig({ TEACHER_PORT: 'sensitive-example' })).toThrow('TEACHER_PORT');
    expect(() => readConfig({ TEACHER_PORT: 'sensitive-example' })).not.toThrow(
      'sensitive-example',
    );
  });
  it('rejects same ports and unsafe public origins', () => {
    expect(() => readConfig({ STUDENT_PORT: '3000' })).toThrow('須不同');
    expect(() => readConfig({ STUDENT_PUBLIC_ORIGIN: 'http://user:secret@localhost' })).toThrow(
      'STUDENT_PUBLIC_ORIGIN',
    );
  });
});
