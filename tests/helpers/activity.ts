import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { parseGuidedNotes } from '../../backend/src/google/guided-notes-parser.js';
import { sampleSheet } from '../fixtures/guided-notes.js';

export function classroom() {
  const store = createStore(10);
  const activity = store.createActivity(2);
  const baseline = [sampleSheet()];
  activity.questions = parseGuidedNotes(baseline);
  activity.source = {
    spreadsheetId: 'demo-sheet',
    sheetIds: [7],
    baseline,
    mappingVersion: 1,
    confirmed: true,
    loadState: 'ready',
  };
  const sessions = createSessions();
  return {
    store,
    activity,
    sessions,
    teacher: sessions.create('teacher'),
    a: sessions.create('student'),
    b: sessions.create('student'),
    groups: [...activity.groups.values()],
    question: activity.questions[0]!,
  };
}
