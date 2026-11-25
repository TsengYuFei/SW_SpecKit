import type { Activity, ActivityStore } from './store.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import { selectResults } from '@classroom/shared/projections/activity';

export function readPersistentActivity(
  persistence: RuntimePersistence,
  store: ActivityStore,
  id: string,
): Activity {
  const saved = persistence.activities.require(id);
  const submissions = persistence.connection.database
    .prepare('SELECT * FROM submissions WHERE activity_id=? ORDER BY sequence')
    .all(id);
  const activity: Activity = {
    id: saved.id,
    ownerAccountId: saved.ownerAccountId,
    bootId: store.bootId,
    phase: saved.phase,
    revision: saved.revision,
    groupCount: saved.groupCount,
    source: {
      spreadsheetId: saved.source.spreadsheetId,
      sheetIds: [saved.source.sheet.sheetId],
      baseline: [saved.source.sheet],
      mappingVersion: 1,
      confirmed: true,
      loadState: 'ready',
    },
    questions: saved.source.questions,
    groups: new Map(
      persistence.activities.groups(id).map((group) => [
        group.id,
        {
          id: group.id,
          ordinal: group.ordinal,
          name: group.name ?? '',
          browserSessionId: group.participantId,
        },
      ]),
    ),
    submissions: new Map(
      submissions.map((row) => [
        String(row.id),
        {
          id: String(row.id),
          requestId: String(row.request_id),
          groupId: String(row.group_id),
          questionId: String(row.question_id),
          receivedAt: Number(row.received_at),
          sequence: Number(row.sequence),
          answers: Object.fromEntries(
            persistence.connection.database
              .prepare(
                'SELECT item_id,answer FROM submission_answers WHERE activity_id=? AND submission_id=?',
              )
              .all(id, String(row.id))
              .map((answer) => [String(answer.item_id), String(answer.answer)]),
          ),
        },
      ]),
    ),
    nextSequence: saved.nextSequence,
    commandReceipts: new Map(),
    writebacks: new Map(),
    finalResults: null,
    writebackPending: ['pending', 'writing'].includes(
      String(persistence.writebacks.getForActivity(id)?.status),
    ),
  };
  if (activity.phase === 'ended') activity.finalResults = selectResults(activity);
  return activity;
}
