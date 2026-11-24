import { randomUUID } from 'node:crypto';
import type { GridSheet, Question, CellValue } from '@classroom/shared/schemas/source';
import { gridSheetSchema } from '@classroom/shared/schemas/source';
import type {
  Writeback,
  QuestionWriteback,
  WriteStatus,
} from '@classroom/shared/schemas/writeback';
import type { Activity, ActivityStore } from '../activity/store.js';
import type { OAuthService } from './oauth.js';
import type { GoogleGateway } from './sheets-client.js';
import { googleError } from './sheets-client.js';
import { parseGuidedNotes } from './guided-notes-parser.js';
import { publishedResults } from '../activity/results.js';
import { AppError, safeError } from '../security/safe-errors.js';
import { publishActivity } from '../sockets/activity-handlers.js';

function cellKey(value: CellValue | null) {
  return JSON.stringify(
    Object.entries(value ?? {})
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
function structure(question: Question) {
  return JSON.stringify({
    ...question,
    items: question.items.map(({ baselineValue: _value, ...item }) => item),
  });
}
function setStatus(question: QuestionWriteback, status: WriteStatus, error?: unknown) {
  question.status = status;
  question.itemStatuses = Object.fromEntries(
    Object.keys(question.expectedAnswers).map((id) => [id, status]),
  );
  if (error) question.error = safeError(error);
  else delete question.error;
}
export function createWritebackService(
  store: ActivityStore,
  oauth: Pick<OAuthService, 'credentials'>,
  gateway: GoogleGateway,
) {
  const running = new Map<string, Promise<void>>();
  function update(activity: Activity, operation: Writeback) {
    const states = operation.questions.map((q) => q.status);
    operation.status = states.includes('writing')
      ? 'writing'
      : states.includes('pending')
        ? 'pending'
        : states.includes('conflict')
          ? 'conflict'
          : states.includes('failed')
            ? 'failed'
            : 'verified';
    activity.writebackPending = operation.status === 'writing' || operation.status === 'pending';
    activity.revision++;
    publishActivity(store);
  }
  async function process(
    activity: Activity,
    operation: Writeback,
    teacherSessionId: string,
    verifying: boolean,
  ) {
    for (const entry of operation.questions) {
      if (verifying && entry.status !== 'pending') continue;
      const wasPending = entry.status === 'pending';
      const question = activity.questions.find((q) => q.id === entry.questionId)!;
      let current: Question | undefined;
      try {
        const credentials = oauth.credentials(teacherSessionId);
        const sheets: GridSheet[] = gridSheetSchema
          .array()
          .parse(await gateway.read(activity.source!.spreadsheetId, credentials));
        const parsed = parseGuidedNotes(sheets);
        current = parsed.find((q) => q.id === question.id);
        if (!current || structure(current) !== structure(question)) {
          setStatus(entry, 'conflict', new AppError('SOURCE_CONFLICT'));
          continue;
        }
        const allExpected = current.items.every(
          (i) =>
            cellKey(i.baselineValue) === cellKey({ stringValue: entry.expectedAnswers[i.id]! }),
        );
        if (allExpected) {
          setStatus(entry, 'verified');
          continue;
        }
        const allBaseline = current.items.every(
          (i) =>
            cellKey(i.baselineValue) ===
            cellKey(question.items.find((original) => original.id === i.id)!.baselineValue),
        );
        if (!allBaseline) {
          setStatus(entry, 'conflict', new AppError('SOURCE_CONFLICT'));
          continue;
        }
      } catch (error) {
        const safe = googleError(error);
        // An ambiguous parse indicates a structural source conflict, not a transport failure.
        if (safe.code === 'MAPPING_AMBIGUOUS')
          setStatus(entry, 'conflict', new AppError('SOURCE_CONFLICT'));
        else setStatus(entry, wasPending ? 'pending' : 'failed', safe);
        continue;
      }
      setStatus(entry, 'writing');
      update(activity, operation);
      try {
        await gateway.write(
          activity.source!.spreadsheetId,
          oauth.credentials(teacherSessionId),
          question.items.map((i) => ({ target: i.target, answer: entry.expectedAnswers[i.id]! })),
        );
      } catch (error) {
        const safe = googleError(error);
        const definite = [
          'INVALID_INPUT',
          'GOOGLE_AUTH_REQUIRED',
          'GOOGLE_FORBIDDEN',
          'SHEET_NOT_FOUND_OR_INACCESSIBLE',
          'RATE_LIMITED',
        ].includes(safe.code);
        setStatus(entry, definite ? 'failed' : 'pending', safe);
        update(activity, operation);
        continue;
      }
      try {
        const sheets = gridSheetSchema
          .array()
          .parse(
            await gateway.read(activity.source!.spreadsheetId, oauth.credentials(teacherSessionId)),
          );
        const actual = parseGuidedNotes(sheets).find((q) => q.id === question.id);
        if (!actual || structure(actual) !== structure(question))
          setStatus(entry, 'conflict', new AppError('SOURCE_CONFLICT'));
        else if (
          actual.items.every(
            (i) =>
              cellKey(i.baselineValue) === cellKey({ stringValue: entry.expectedAnswers[i.id]! }),
          )
        )
          setStatus(entry, 'verified');
        else setStatus(entry, 'pending', new AppError('WRITE_PENDING'));
      } catch (error) {
        setStatus(entry, 'pending', googleError(error));
      }
      update(activity, operation);
    }
    update(activity, operation);
  }
  function launch(activity: Activity, operation: Writeback, sessionId: string, verifying: boolean) {
    // Defer work until the synchronous receipt and lock are stored.
    const task = Promise.resolve()
      .then(() => process(activity, operation, sessionId, verifying))
      .catch(() => {
        for (const question of operation.questions)
          if (question.status === 'writing')
            setStatus(question, 'pending', new AppError('INTERNAL_ERROR'));
        update(activity, operation);
      })
      .finally(() => running.delete(operation.operationId));
    running.set(operation.operationId, task);
  }
  function start(activityId: string, sessionId: string, requestId: string): Writeback {
    const activity = store.requireActivity(activityId);
    return store.command(activity, sessionId, 'writeback:start', requestId, {}, () => {
      const results = publishedResults(activity);
      if (!activity.source?.confirmed) throw new AppError('INVALID_PHASE');
      if (activity.writebackPending) throw new AppError('WRITE_PENDING');
      oauth.credentials(sessionId);
      const operation: Writeback = {
        operationId: randomUUID(),
        activityId,
        status: 'writing',
        questions: results
          .filter((r) => r.winnerGroup)
          .map((r) => ({
            questionId: r.questionId,
            status: 'writing',
            expectedAnswers: { ...r.answers },
            itemStatuses: Object.fromEntries(
              Object.keys(r.answers).map((id) => [id, 'writing' as const]),
            ),
          })),
      };
      activity.writebacks.set(operation.operationId, operation);
      activity.writebackPending = true;
      activity.revision++;
      publishActivity(store);
      launch(activity, operation, sessionId, false);
      return operation;
    });
  }
  function get(activityId: string, operationId: string) {
    const operation = store.requireActivity(activityId).writebacks.get(operationId);
    if (!operation) throw new AppError('ACTIVITY_UNAVAILABLE');
    return operation;
  }
  async function verify(activityId: string, operationId: string, sessionId: string) {
    const activity = store.requireActivity(activityId);
    const operation = get(activityId, operationId);
    if (running.has(operationId)) throw new AppError('WRITE_PENDING');
    if (operation.status !== 'pending') return operation;
    launch(activity, operation, sessionId, true);
    await running.get(operationId);
    return operation;
  }
  return {
    start,
    get,
    verify,
    async wait(operationId: string) {
      await running.get(operationId);
    },
  };
}
