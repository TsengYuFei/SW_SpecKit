import { randomUUID } from 'node:crypto';
import { catalogClassroom } from './activity.js';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { AppError } from '../../backend/src/security/safe-errors.js';
export async function automaticFixture() {
  const c = await catalogClassroom();
  let grid = structuredClone(c.activity.source!.baseline[0]!);
  const writes: unknown[] = [];
  c.server.gateway.readSheetById = async (_id, sheetId) => {
    if (sheetId !== grid.sheetId) throw new AppError('SOURCE_CONFLICT');
    return structuredClone(grid);
  };
  c.server.gateway.write = async (_id, _credentials, updates) => {
    writes.push(structuredClone(updates));
    for (const { target, answer } of updates) {
      grid.rows[target.rowIndex] ??= [];
      grid.rows[target.rowIndex]![target.columnIndex] = {
        userEnteredValue: { stringValue: answer },
      };
    }
  };
  const run = (session: typeof c.a, event: string, extra = {}) =>
    executeCommand(c.store, session, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' });
  run(c.b, 'group:join', { groupId: c.groups[1]!.id, name: '另一組' });
  run(c.teacher, 'activity:start');
  const answer = () =>
    run(c.a, 'answer:submit', {
      questionId: c.question.id,
      answers: Object.fromEntries(
        c.question.items.map((item, index) => [item.id, index === 0 ? '=SUM(A1)' : '安全答案']),
      ),
    });
  const end = () => run(c.teacher, 'activity:end');
  return {
    ...c,
    run,
    answer,
    end,
    writes,
    get grid() {
      return grid;
    },
    set grid(value) {
      grid = value;
    },
  };
}
