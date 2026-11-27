import type { RuntimePersistence } from '../persistence/repositories.js';
import type { OAuthService } from '../google/oauth.js';
import { exportMetadata, readExportSnapshot } from '../persistence/result-export-reader.js';
import { encodeCsv } from '../export/csv.js';
import { exportFilename } from '../export/filename.js';
import { createExportGate } from '../export/export-gate.js';
import { AppError } from '../security/safe-errors.js';
export function createResultExportService(
  p: RuntimePersistence,
  oauth: OAuthService,
  gate = createExportGate(),
) {
  function checkScope(scope: { session: string; ownerAccountId: string; authGeneration: number }) {
    if (
      oauth.generation(scope.session) !== scope.authGeneration ||
      oauth.account(scope.session).sub !== scope.ownerAccountId
    )
      throw new AppError('GOOGLE_AUTH_REQUIRED');
  }
  return {
    checkScope,
    async download(session: string, id: string, signal?: AbortSignal) {
      const scope = {
        session,
        ownerAccountId: oauth.account(session).sub,
        authGeneration: oauth.generation(session),
      };
      exportMetadata(p, id, scope.ownerAccountId);
      const lease = gate.acquire(session);
      try {
        const check = () => {
          lease.check(signal);
          checkScope(scope);
        };
        check();
        const exportedAt = Date.now();
        const snapshot = readExportSnapshot(p, id, scope.ownerAccountId, exportedAt);
        const bytes = await encodeCsv(snapshot.order, { check });
        check();
        return {
          bytes,
          contentType: 'text/csv; charset=utf-8',
          ...exportFilename(snapshot.activityName, id, exportedAt),
          scope,
        };
      } finally {
        lease.release();
      }
    },
  };
}
export type ResultExportService = ReturnType<typeof createResultExportService>;
