import { randomUUID } from 'node:crypto';
import { catalogServer } from './catalog-server';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer';
import { publishActivity } from '../../backend/src/sockets/activity-handlers';
import type { GridSheet } from '../../shared/src/schemas/source';

export async function uiClassroom(active = true, questionCount = 6) {
  const server = await catalogServer();
  const grid: GridSheet = {
    sheetId: 17,
    title: '六題學習單',
    rows: [
      ['題號', '題目', '', '作答'],
      ...Array.from({ length: questionCount }, (_, index) => [
        String(index + 1),
        `第${index + 1}題測試問題`,
      ]),
    ].map((row) => row.map((value) => ({ userEnteredValue: { stringValue: value } }))),
    merges: [
      { sheetId: 17, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
      ...Array.from({ length: questionCount + 1 }, (_, index) => ({
        sheetId: 17,
        startRowIndex: index,
        endRowIndex: index + 1,
        startColumnIndex: 3,
        endColumnIndex: 5,
      })),
    ],
  };
  server.gateway.readFirstSheet = async () => ({ spreadsheetTitle: '六題教材', sheet: grid });
  const client = await server.client();
  const preview = (
    await (await client.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
  ).data;
  const created = await client.post('/api/activities', {
    requestId: randomUUID(),
    previewId: preview.previewId,
    groupCount: 4,
  });
  if (!(await created.json()).ok) throw new Error('UI_FIXTURE_CREATION_FAILED');
  const activity = server.store.activity!;
  const teacher = server.sessions.find(client.cookie, 'teacher')!;
  const students = Array.from({ length: 3 }, () => server.sessions.create('student'));
  const groups = [...activity.groups.values()];
  const longName = '長'.repeat(36) + '<&甲>';
  const run = (session: typeof teacher, event: string, extra = {}) => {
    const result = executeCommand(server.store, session, event, {
      activityId: activity.id,
      requestId: randomUUID(),
      ...extra,
    });
    publishActivity(server.store);
    return result;
  };
  students.forEach((session, index) =>
    run(session, 'group:join', {
      groupId: groups[index]!.id,
      name: [longName, '討論乙隊', '待答丙隊'][index],
    }),
  );
  if (active) run(teacher, 'activity:start');
  const answer = (index: number, questionIndex: number, text: string) => {
    const question = activity.questions[questionIndex]!;
    return run(students[index]!, 'answer:submit', {
      questionId: question.id,
      answers: { [question.items[0]!.id]: text },
    });
  };
  return { server, client, activity, teacher, students, groups, longName, run, answer };
}
