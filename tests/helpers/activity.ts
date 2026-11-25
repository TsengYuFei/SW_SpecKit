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

// Pure reducer tests use classroom(); HTTP/UI source tests enter through this verified catalog flow.
export async function catalogClassroom() {
  const { catalogServer } = await import('./catalog-server.js');
  const server = await catalogServer();
  const client = await server.client();
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
  ).data;
  const { randomUUID } = await import('node:crypto');
  await client.post('/api/activities', {
    requestId: randomUUID(),
    previewId: preview.previewId,
    groupCount: 2,
  });
  const activity = server.store.activity!;
  return {
    server,
    client,
    store: server.store,
    sessions: server.sessions,
    activity,
    teacher: server.sessions.find(client.cookie, 'teacher')!,
    a: server.sessions.create('student'),
    b: server.sessions.create('student'),
    groups: [...activity.groups.values()],
    question: activity.questions[0]!,
  };
}
