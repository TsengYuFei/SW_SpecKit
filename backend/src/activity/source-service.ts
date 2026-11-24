import { gridSheetSchema, type Source } from '@classroom/shared/schemas/source';
import type { Config } from '../config.js';
import type { GoogleGateway } from '../google/sheets-client.js';
import type { OAuthService } from '../google/oauth.js';
import { parseGuidedNotes } from '../google/guided-notes-parser.js';
import { AppError } from '../security/safe-errors.js';
import type { ActivityStore } from './store.js';
import { publishActivity } from '../sockets/activity-handlers.js';

export function parseSpreadsheetId(input: string) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(url.pathname);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'docs.google.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      match
    )
      return match[1]!;
  } catch {
    /* Invalid input is mapped below. */
  }
  throw new AppError('INVALID_INPUT');
}
export function sourcePreview(activity: ReturnType<ActivityStore['requireActivity']>) {
  const source = activity.source;
  return {
    activityId: activity.id,
    phase: activity.phase,
    groupCount: activity.groupCount,
    source: source
      ? {
          spreadsheetId: source.spreadsheetId,
          mappingVersion: source.mappingVersion,
          confirmed: source.confirmed,
          loadState: source.loadState,
          questions: activity.questions,
        }
      : null,
  };
}
export function createSourceService(
  store: ActivityStore,
  oauth: OAuthService,
  gateway: GoogleGateway,
  config: Config,
) {
  async function load(id: string, teacherSessionId: string, input: string) {
    const activity = store.requireActivity(id);
    if (activity.phase !== 'waiting' || activity.source?.loadState === 'loading')
      throw new AppError('INVALID_PHASE');
    const spreadsheetId = parseSpreadsheetId(input);
    const credentials = oauth.credentials(teacherSessionId);
    const mappingVersion = (activity.source?.mappingVersion ?? 0) + 1;
    const source: Source = {
      spreadsheetId,
      sheetIds: [],
      baseline: [],
      mappingVersion,
      confirmed: false,
      loadState: 'loading',
    };
    activity.source = source;
    activity.questions = [];
    activity.revision++;
    publishActivity(store);
    try {
      const sheets = gridSheetSchema.array().parse(await gateway.read(spreadsheetId, credentials));
      const cells = sheets.reduce(
        (total, sheet) => total + sheet.rows.reduce((count, row) => count + row.length, 0),
        0,
      );
      if (cells > config.MAX_SOURCE_CELLS) throw new AppError('SOURCE_TOO_LARGE');
      if (store.activity !== activity || activity.phase !== 'waiting' || activity.source !== source)
        throw new AppError('SOURCE_CONFLICT');
      const questions = parseGuidedNotes(sheets);
      source.sheetIds = sheets.map((s) => s.sheetId);
      source.baseline = sheets;
      source.loadState = 'ready';
      activity.questions = questions;
      activity.revision++;
      publishActivity(store);
      return sourcePreview(activity);
    } catch (error) {
      if (store.activity === activity && activity.source === source) {
        source.loadState = 'error';
        activity.revision++;
        publishActivity(store);
      }
      throw error;
    }
  }
  function confirm(id: string, mappingVersion: number) {
    const activity = store.requireActivity(id);
    if (
      activity.phase !== 'waiting' ||
      activity.source?.loadState !== 'ready' ||
      activity.source.mappingVersion !== mappingVersion
    )
      throw new AppError('SOURCE_CONFLICT');
    activity.source.confirmed = true;
    activity.revision++;
    publishActivity(store);
    return sourcePreview(activity);
  }
  return { load, confirm };
}
