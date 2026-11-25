import type { Activity, ActivityStore } from './store.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import { selectResults } from '@classroom/shared/projections/activity';
import { persistentWriteback } from '../persistence/writeback-projection.js';
import { AppError } from '../security/safe-errors.js';

export function readPersistentActivity(
  persistence: RuntimePersistence,
  store: ActivityStore,
  id: string,
): Activity {
  const saved = persistence.activities.require(id);
  const job = persistentWriteback(persistence, id);
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
        JSON.stringify([String(row.group_id), String(row.question_id)]),
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
    writebacks: job ? new Map([[job.operationId, job]]) : new Map(),
    finalResults: null,
    writebackPending: ['pending', 'writing'].includes(
      String(persistence.writebacks.getForActivity(id)?.status),
    ),
  };
  if (activity.phase === 'ended') {
    const frozen = persistence.connection.database
      .prepare('SELECT question_id,winner_submission_id FROM results WHERE activity_id=?')
      .all(id);
    if (!job) activity.finalResults = selectResults(activity);
    else
      activity.finalResults = activity.questions.map((question) => {
        const result = frozen.find((row) => row.question_id === question.id);
        if (!result) throw new AppError('STORAGE_CORRUPT');
        const submission = [...activity.submissions.values()].find(
          (value) => value.id === result.winner_submission_id,
        );
        const group = submission ? activity.groups.get(submission.groupId) : undefined;
        const expected = job.questions.find((value) => value.questionId === question.id);
        if (result.winner_submission_id !== null && (!group || !expected))
          throw new AppError('STORAGE_CORRUPT');
        return {
          questionId: question.id,
          displayNumber: question.displayNumber,
          winnerGroup: group ? { id: group.id, ordinal: group.ordinal, name: group.name } : null,
          answers: expected ? { ...expected.expectedAnswers } : {},
        };
      });
  }
  return activity;
}
