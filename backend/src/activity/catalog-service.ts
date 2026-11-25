import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  catalogQuerySchema,
  sourcePreviewRequestSchema,
  createCatalogActivitySchema,
  catalogPageSchema,
  catalogPreviewSchema,
} from '@classroom/shared/schemas/catalog';
import type { GoogleGateway } from '../google/sheets-client.js';
import type { OAuthService } from '../google/oauth.js';
import type { Config } from '../config.js';
import type { RuntimePersistence } from '../persistence/repositories.js';
import {
  durableSourceSchema,
  durableSourceFingerprint,
  type DurableSource,
} from '../persistence/activity-repository.js';
import { parseGuidedNotes } from '../google/guided-notes-parser.js';
import { requireAuthorizedTeacherAccount, requireActivityOwner } from '../security/guards.js';
import { AppError } from '../security/safe-errors.js';
import { readPersistentActivity } from './persistent-store.js';
import { sourcePreview } from './source-service.js';
import type { ActivityStore } from './store.js';

export function createCatalogService(
  store: ActivityStore,
  oauth: OAuthService,
  gateway: GoogleGateway,
  config: Config,
  persistence: RuntimePersistence,
  clock = () => Date.now(),
) {
  type Cached = { sessionId: string; owner: string; generation: number; expiresAt: number };
  const cursors = new Map<string, Cached & { query: string; pageToken: string }>();
  const previews = new Map<string, Cached & { source: DurableSource; fingerprint: string }>();
  function bind(sessionId: string): Cached {
    const auth = requireAuthorizedTeacherAccount(oauth, sessionId);
    return {
      sessionId,
      owner: auth.account.sub,
      generation: auth.authGeneration,
      expiresAt: clock() + 300000,
    };
  }
  function current(saved: Cached, sessionId: string) {
    const now = bind(sessionId);
    return (
      saved.sessionId === sessionId &&
      saved.owner === now.owner &&
      saved.generation === now.generation &&
      saved.expiresAt > clock()
    );
  }
  function bounded<T>(map: Map<string, T>, id: string, value: T) {
    map.set(id, value);
    if (map.size > 1000) map.delete(map.keys().next().value!);
  }
  oauth.onChange((sessionId) => {
    for (const [id, value] of cursors) if (value.sessionId === sessionId) cursors.delete(id);
    for (const [id, value] of previews) if (value.sessionId === sessionId) previews.delete(id);
  });
  async function readSource(spreadsheetId: string, sessionId: string, bound: Cached) {
    if (!gateway.getFileCapability || !gateway.readFirstSheet) throw new AppError('GOOGLE_ERROR');
    const credentials = oauth.credentials(sessionId);
    const capability = await gateway.getFileCapability(spreadsheetId, credentials);
    oauth.assertGeneration(sessionId, bound.generation);
    if (!capability.canEdit) throw new AppError('SOURCE_READ_ONLY');
    const response = await gateway.readFirstSheet(spreadsheetId, credentials);
    oauth.assertGeneration(sessionId, bound.generation);
    const source = durableSourceSchema.parse({
      spreadsheetId,
      spreadsheetTitle: response.spreadsheetTitle || capability.name,
      sheet: response.sheet,
      questions: parseGuidedNotes([response.sheet]),
    });
    const cells = source.sheet.rows.reduce((sum, row) => sum + row.length, 0);
    if (cells > config.MAX_SOURCE_CELLS) throw new AppError('SOURCE_TOO_LARGE');
    return source;
  }
  function response(id: string, owner: string) {
    persistence.activities.getOwned(id, owner);
    const activity =
      store.activity?.id === id ? store.activity : readPersistentActivity(persistence, store, id);
    return {
      ...sourcePreview(activity),
      studentUrl: config.STUDENT_PUBLIC_ORIGIN + '/student/' + id,
    };
  }
  return {
    authorize(sessionId: string, activityId?: string) {
      const auth = activityId
        ? requireActivityOwner(oauth, persistence.activities, sessionId, activityId)
        : requireAuthorizedTeacherAccount(oauth, sessionId);
      return { accountId: auth.account.sub, authGeneration: auth.authGeneration };
    },
    async list(sessionId: string, input: unknown) {
      const query = catalogQuerySchema.parse(input),
        bound = bind(sessionId);
      let pageToken: string | undefined;
      if (query.cursor) {
        const cursor = cursors.get(query.cursor);
        if (!cursor || !current(cursor, sessionId) || cursor.query !== query.query)
          throw new AppError('CURSOR_INVALID');
        pageToken = cursor.pageToken;
      }
      if (!gateway.listSpreadsheets) throw new AppError('GOOGLE_ERROR');
      const page = await gateway.listSpreadsheets(oauth.credentials(sessionId), {
        query: query.query,
        pageToken,
      });
      oauth.assertGeneration(sessionId, bound.generation);
      let nextCursor: string | null = null;
      if (page.nextPageToken) {
        if (page.nextPageToken.length > 4096) throw new AppError('GOOGLE_ERROR');
        nextCursor = randomUUID();
        bounded(cursors, nextCursor, {
          ...bound,
          query: query.query,
          pageToken: page.nextPageToken,
        });
      }
      return catalogPageSchema.parse({
        items: page.items,
        nextCursor,
        incompleteSearch: page.incompleteSearch,
      });
    },
    async preview(sessionId: string, input: unknown) {
      const { spreadsheetId } = sourcePreviewRequestSchema.parse(input),
        bound = bind(sessionId);
      const source = await readSource(spreadsheetId, sessionId, bound),
        fingerprint = durableSourceFingerprint(source),
        previewId = randomUUID();
      bounded(previews, previewId, { ...bound, source, fingerprint });
      return catalogPreviewSchema.parse({
        previewId,
        source: {
          spreadsheetId,
          title: source.spreadsheetTitle,
          sheetId: source.sheet.sheetId,
          sheetTitle: source.sheet.title,
        },
        questions: source.questions,
        fingerprint,
        expiresAt: bound.expiresAt,
      });
    },
    async create(sessionId: string, input: unknown) {
      const body = createCatalogActivitySchema
          .extend({ groupCount: z.number().int().min(1).max(config.MAX_GROUPS) })
          .parse(input),
        bound = bind(sessionId);
      const command = {
        ownerAccountId: bound.owner,
        event: 'activity:create',
        requestId: body.requestId,
        payload: body,
      };
      if (persistence.receipts.get(command)) {
        const saved = persistence.commands.execute<{ activityId: string }>(command, () => {
          throw new AppError('INTERNAL_ERROR');
        });
        return response(saved.activityId, bound.owner);
      }
      const preview = previews.get(body.previewId);
      if (!preview || !current(preview, sessionId)) throw new AppError('PREVIEW_EXPIRED');
      const latest = await readSource(preview.source.spreadsheetId, sessionId, bound);
      if (durableSourceFingerprint(latest) !== preview.fingerprint)
        throw new AppError('SOURCE_CONFLICT');
      oauth.assertGeneration(sessionId, bound.generation);
      const saved = persistence.commands.execute(command, () => {
        const activity = persistence.activities.create({
          ownerAccountId: bound.owner,
          groupCount: body.groupCount,
          source: latest,
        });
        return { activityId: activity.id };
      });
      if (
        persistence.activities.current()?.id === saved.activityId &&
        store.activity?.id !== saved.activityId
      )
        store.installActivity(readPersistentActivity(persistence, store, saved.activityId));
      return response(saved.activityId, bound.owner);
    },
    get(sessionId: string, id: string) {
      const auth = requireActivityOwner(oauth, persistence.activities, sessionId, id);
      const result = response(id, auth.account.sub);
      return {
        activityId: result.activityId,
        phase: result.phase,
        groupCount: result.groupCount,
        source: result.source,
      };
    },
    restoreCurrent() {
      const saved = persistence.activities.current();
      if (saved) store.installActivity(readPersistentActivity(persistence, store, saved.id));
    },
  };
}
export type CatalogService = ReturnType<typeof createCatalogService>;
