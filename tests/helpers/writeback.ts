import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../backend/src/activity/lifecycle-reducer.js';
import { createWritebackService } from '../../backend/src/google/writeback-service.js';
import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { classroom } from './activity.js';
import type { PersistenceFixture } from './persistence.js';

export function writebackFixture(persistence?: PersistenceFixture) {
  const c = classroom();
  const run = (session: typeof c.a, event: string, extra = {}) =>
    executeCommand(c.store, session, event, {
      activityId: c.activity.id,
      requestId: randomUUID(),
      ...extra,
    });
  run(c.a, 'group:join', { groupId: c.groups[0]!.id, name: '測試組' });
  run(c.teacher, 'activity:start');
  run(c.a, 'answer:submit', {
    questionId: c.question.id,
    answers: Object.fromEntries(
      c.question.items.map((i, index) => [i.id, index === 0 ? '=SUM(A1)' : '安全答案']),
    ),
  });
  run(c.teacher, 'activity:end');
  let grid = structuredClone(c.activity.source!.baseline);
  const writes: unknown[] = [];
  const gateway: GoogleGateway = {
    authorizationUrl: () => '',
    exchange: async () => ({}),
    read: async () => structuredClone(grid),
    async write(_id, _credentials, updates) {
      writes.push(structuredClone(updates));
      for (const { target, answer } of updates) {
        const sheet = grid.find((s) => s.sheetId === target.sheetId)!;
        sheet.rows[target.rowIndex] ??= [];
        sheet.rows[target.rowIndex]![target.columnIndex] = {
          userEnteredValue: { stringValue: answer },
        };
      }
    },
  };
  const service = createWritebackService(c.store, { credentials: () => ({}) }, gateway);
  return {
    ...c,
    persistence,
    close: () => persistence?.close(),
    gateway,
    service,
    writes,
    get grid() {
      return grid;
    },
    set grid(value) {
      grid = value;
    },
    start: () => service.start(c.activity.id, c.teacher.sessionId, randomUUID()),
  };
}

export async function catalogWritebackFixture() {
  const { automaticFixture } = await import('./automatic-writeback.js');
  const c = await automaticFixture();
  c.answer();
  return { ...c, gateway: c.server.gateway, grid: [c.grid], service: c.server.durableWriteback! };
}
