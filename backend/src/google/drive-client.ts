import { google } from 'googleapis';
import type { TokenSet } from './sheets-client.js';
import { spreadsheetCandidateSchema } from '@classroom/shared/schemas/catalog';
import { AppError } from '../security/safe-errors.js';

export function createDriveClient(
  auth: (credentials: TokenSet) => InstanceType<typeof google.auth.OAuth2>,
  retry: <T>(action: () => Promise<T>) => Promise<T>,
) {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return {
    async listSpreadsheets(credentials: TokenSet, input: { query: string; pageToken?: string }) {
      const api = google.drive({ version: 'v3', auth: auth(credentials) });
      const response = await retry(() =>
        api.files.list(
          {
            q:
              "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false" +
              (input.query ? " and name contains '" + escape(input.query) + "'" : ''),
            pageSize: 100,
            pageToken: input.pageToken,
            corpora: 'allDrives',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            orderBy: 'name,modifiedTime desc',
            fields:
              'nextPageToken,incompleteSearch,files(id,name,modifiedTime,owners(displayName,emailAddress),capabilities(canEdit))',
          },
          { timeout: 15000, retry: false },
        ),
      );
      if (response.data.nextPageToken && response.data.nextPageToken.length > 4096)
        throw new AppError('GOOGLE_ERROR');
      return {
        items: (response.data.files ?? []).map((file) =>
          spreadsheetCandidateSchema.parse({
            id: file.id,
            name: file.name ?? '',
            canEdit: file.capabilities?.canEdit === true,
            ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
            ...(file.owners?.[0]
              ? { ownerLabel: file.owners[0].displayName ?? file.owners[0].emailAddress ?? '' }
              : {}),
          }),
        ),
        nextPageToken: response.data.nextPageToken ?? null,
        incompleteSearch: response.data.incompleteSearch === true,
      };
    },
    async getFileCapability(spreadsheetId: string, credentials: TokenSet) {
      const response = await retry(() =>
        google.drive({ version: 'v3', auth: auth(credentials) }).files.get(
          {
            fileId: spreadsheetId,
            supportsAllDrives: true,
            fields: 'id,name,trashed,mimeType,capabilities(canEdit)',
          },
          { timeout: 15000, retry: false },
        ),
      );
      if (
        response.data.trashed ||
        response.data.mimeType !== 'application/vnd.google-apps.spreadsheet'
      )
        throw new AppError('SHEET_NOT_FOUND_OR_INACCESSIBLE');
      return {
        id: spreadsheetId,
        name: response.data.name ?? '',
        canEdit: response.data.capabilities?.canEdit === true,
      };
    },
  };
}
