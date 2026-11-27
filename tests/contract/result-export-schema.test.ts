import { expect, it } from 'vitest';
import { parseAnswerOrderInput } from '../../shared/src/schemas/result-export.js';
import { projectActivity } from '../../shared/src/projections/activity.js';
import { resultExportFixture } from '../helpers/result-export.js';
import { readPersistentActivity } from '../../backend/src/activity/persistent-store.js';

it('explicitly picks existing teacher fields without rejecting legitimate metadata or changing wire objects', async () => {
  const c = await resultExportFixture({ active: true });
  try {
    const snapshot = c.snapshot(c.activeActivity!);
    const before = structuredClone(snapshot);
    const parsed = parseAnswerOrderInput(snapshot);
    expect(snapshot).toEqual(before);
    expect(Object.keys(parsed).sort()).toEqual(['groups', 'questions', 'submissions']);
    expect(parsed.groups[2]).toMatchObject({ name: '', occupied: false });
    expect(parsed.submissions).toHaveLength(4);
    expect(parsed.submissions[0]).not.toHaveProperty('requestId');
    expect(parsed.submissions[0]).not.toHaveProperty('receivedAt');
    const activity = readPersistentActivity(
      c.server.persistence,
      c.server.store,
      c.activeActivity!,
    );
    const student = projectActivity(activity, {
      role: 'student',
      sessionId: 'invalid-demo-student',
    });
    expect(student).not.toHaveProperty('submissions');
    expect(() => parseAnswerOrderInput(student)).toThrow();
    expect(() => parseAnswerOrderInput({ ...snapshot, submissions: undefined })).toThrow();
    expect(parseAnswerOrderInput({ ...snapshot, submissions: [] }).submissions).toEqual([]);
  } finally {
    await c.close();
  }
});
