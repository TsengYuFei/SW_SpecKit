import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { historyPageSchema, historyDetailSchema } from '@classroom/shared/schemas/history';
import { projectActivity } from '@classroom/shared/projections/activity';
import type { RuntimePersistence } from '../persistence/repositories.js';
import type { ActivityStore } from './store.js';
import type { OAuthService } from '../google/oauth.js';
import { requireAuthorizedTeacherAccount, requireActivityOwner } from '../security/guards.js';
import { readPersistentActivity } from './persistent-store.js';
import { sourcePreview } from './source-service.js';
import { AppError } from '../security/safe-errors.js';

export function createHistoryService(
  p: RuntimePersistence,
  store: ActivityStore,
  oauth: OAuthService,
  clock = () => Date.now(),
) {
  type Cursor = {
    sessionId: string;
    owner: string;
    generation: number;
    limit: number;
    expiresAt: number;
    createdAt: number;
    id: string;
  };
  const cursors = new Map<string, Cursor>();
  oauth.onChange((sessionId) => {
    for (const [key, value] of cursors) if (value.sessionId === sessionId) cursors.delete(key);
  });
  return {
    list(sessionId: string, input: unknown) {
      const query = z
        .strictObject({
          cursor: z.string().min(1).max(8192).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(input);
      const auth = requireAuthorizedTeacherAccount(oauth, sessionId);
      let cursor: Cursor | undefined;
      if (query.cursor) {
        cursor = cursors.get(query.cursor);
        if (
          !cursor ||
          cursor.owner !== auth.account.sub ||
          cursor.sessionId !== sessionId ||
          cursor.generation !== auth.authGeneration ||
          cursor.limit !== query.limit ||
          cursor.expiresAt <= clock()
        )
          throw new AppError('CURSOR_INVALID');
      }
      const rows = p.connection.database
        .prepare(
          `SELECT a.*,COALESCE(j.status,'idle') AS writeback_status FROM activities a LEFT JOIN writeback_jobs j ON j.activity_id=a.id WHERE a.owner_account_id=? ${cursor ? 'AND (a.created_at<? OR (a.created_at=? AND a.id<?))' : ''} ORDER BY a.created_at DESC,a.id DESC LIMIT ?`,
        )
        .all(
          auth.account.sub,
          ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []),
          query.limit + 1,
        );
      const page = rows.slice(0, query.limit);
      let nextCursor: string | null = null;
      if (rows.length > query.limit) {
        const last = page.at(-1)!;
        nextCursor = randomUUID();
        cursors.set(nextCursor, {
          sessionId,
          owner: auth.account.sub,
          generation: auth.authGeneration,
          limit: query.limit,
          expiresAt: clock() + 300000,
          createdAt: Number(last.created_at),
          id: String(last.id),
        });
        if (cursors.size > 1000) cursors.delete(cursors.keys().next().value!);
      }
      return historyPageSchema.parse({
        items: page.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          phase: row.phase,
          spreadsheetTitle: row.spreadsheet_title,
          sheetTitle: row.source_sheet_title,
          groupCount: row.group_count,
          writebackSummary: row.writeback_status,
        })),
        nextCursor,
      });
    },
    detail(sessionId: string, id: string) {
      const auth = requireActivityOwner(oauth, p.activities, sessionId, id),
        saved = p.activities.getOwned(id, auth.account.sub);
      const activity = readPersistentActivity(p, store, id);
      return historyDetailSchema.parse({
        ...sourcePreview(activity),
        createdAt: saved.createdAt,
        startedAt: saved.startedAt,
        endedAt: saved.endedAt,
        spreadsheetTitle: saved.source.spreadsheetTitle,
        sheetTitle: saved.source.sheet.title,
        snapshot: {
          ...projectActivity(activity, { role: 'teacher', sessionId }),
          authGeneration: auth.authGeneration,
        },
      });
    },
  };
}
export type HistoryService = ReturnType<typeof createHistoryService>;
