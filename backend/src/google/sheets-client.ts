import { googleError } from './errors.js';
import { google } from 'googleapis';
import type { GoogleIdentity } from '@classroom/shared/schemas/account';
import type { SpreadsheetCandidate } from '@classroom/shared/schemas/catalog';
import { googleIdentitySchema } from '@classroom/shared/schemas/account';
import { chooseWorksheet } from './worksheet-selection.js';
import { createDriveClient } from './drive-client.js';
import { setTimeout as sleep } from 'node:timers/promises';
import type { GridSheet, Question } from '@classroom/shared/schemas/source';
import type { Config } from '../config.js';
import { AppError } from '../security/safe-errors.js';

export type TokenSet = InstanceType<typeof google.auth.OAuth2>['credentials'];
export interface GoogleGateway {
  authorizationUrl(state: string, nonce?: string): string;
  exchange(code: string): Promise<TokenSet>;
  verifiedIdentity?(credentials: TokenSet, nonce: string): Promise<GoogleIdentity>;
  listSpreadsheets?(
    credentials: TokenSet,
    input: { query: string; pageToken?: string },
  ): Promise<{
    items: SpreadsheetCandidate[];
    nextPageToken: string | null;
    incompleteSearch: boolean;
  }>;
  getFileCapability?(
    spreadsheetId: string,
    credentials: TokenSet,
  ): Promise<{ id: string; name: string; canEdit: boolean }>;
  readFirstSheet?(
    spreadsheetId: string,
    credentials: TokenSet,
  ): Promise<{ spreadsheetTitle: string; sheet: GridSheet }>;
  readSheetById?(spreadsheetId: string, sheetId: number, credentials: TokenSet): Promise<GridSheet>;
  read(spreadsheetId: string, credentials: TokenSet): Promise<GridSheet[]>;
  write(spreadsheetId: string, credentials: TokenSet, updates: CellUpdate[]): Promise<void>;
}
export interface CellUpdate {
  target: Question['items'][number]['target'];
  answer: string;
}
export { googleError } from './errors.js';
export async function readWithRetry<T>(
  action: () => Promise<T>,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      const safe = googleError(error);
      if (attempt >= 3 || !['NETWORK_ERROR', 'GOOGLE_ERROR', 'RATE_LIMITED'].includes(safe.code))
        throw safe;
      await wait(250 * 2 ** attempt + Math.floor(Math.random() * 100));
    }
  }
}
export function createGoogleGateway(config: Config): GoogleGateway {
  function client() {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)
      throw new AppError('GOOGLE_AUTH_REQUIRED');
    return new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI ?? 'http://127.0.0.1:3000/api/google/callback',
    );
  }
  function authenticated(credentials: TokenSet) {
    const auth = client();
    auth.setCredentials(credentials);
    auth.on('tokens', (tokens) => Object.assign(credentials, tokens));
    return auth;
  }
  const drive = createDriveClient(authenticated, readWithRetry);
  async function readGrids(
    spreadsheetId: string,
    credentials: TokenSet,
    selection: 'all' | 'first' | number,
  ) {
    const auth = client();
    auth.setCredentials(credentials);
    auth.on('tokens', (tokens) => Object.assign(credentials, tokens));
    const api = google.sheets({ version: 'v4', auth });
    const metadata = await readWithRetry(() =>
      api.spreadsheets.get(
        {
          spreadsheetId,
          fields:
            selection === 'all'
              ? 'sheets(properties,merges)'
              : 'properties(title),sheets(properties,merges)',
        },
        { timeout: 15000, retry: false },
      ),
    );
    const sheets: GridSheet[] = [];
    let cellCount = 0;
    const available = metadata.data.sheets ?? [];
    const selected =
      selection === 'all'
        ? available
        : [chooseWorksheet(available, selection === 'first' ? undefined : selection)];
    for (const sheet of selected) {
      const properties = sheet.properties;
      if (properties?.sheetType && properties.sheetType !== 'GRID') continue;
      const sheetId = properties?.sheetId;
      if (sheetId === null || sheetId === undefined) throw new AppError('GOOGLE_ERROR');
      const rowCount = properties?.gridProperties?.rowCount ?? 0;
      const columnCount = properties?.gridProperties?.columnCount ?? 0;
      cellCount += rowCount * columnCount;
      if (cellCount > config.MAX_SOURCE_CELLS) throw new AppError('SOURCE_TOO_LARGE');
      const rows: GridSheet['rows'] = Array.from({ length: rowCount }, () => []);
      for (let start = 0; start < rowCount; start += 500) {
        const result = await readWithRetry(() =>
          api.spreadsheets.getByDataFilter(
            {
              spreadsheetId,
              requestBody: {
                dataFilters: [
                  {
                    gridRange: {
                      sheetId,
                      startRowIndex: start,
                      endRowIndex: Math.min(start + 500, rowCount),
                    },
                  },
                ],
                includeGridData: true,
              },
              fields:
                'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue))))',
            },
            { timeout: 15000, retry: false },
          ),
        );
        const returned = result.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
        if (!returned) throw new AppError('GOOGLE_ERROR');
        for (const grid of returned.data ?? []) {
          for (const [offset, row] of (grid.rowData ?? []).entries()) {
            const rowIndex = (grid.startRow ?? start) + offset;
            rows[rowIndex] ??= [];
            for (const [col, cell] of (row.values ?? []).entries()) {
              rows[rowIndex]![(grid.startColumn ?? 0) + col] = {
                userEnteredValue: cell.userEnteredValue
                  ? {
                      stringValue: cell.userEnteredValue.stringValue ?? undefined,
                      numberValue: cell.userEnteredValue.numberValue ?? undefined,
                      boolValue: cell.userEnteredValue.boolValue ?? undefined,
                      formulaValue: cell.userEnteredValue.formulaValue ?? undefined,
                    }
                  : undefined,
                formattedValue: cell.formattedValue ?? undefined,
              };
            }
          }
        }
      }
      sheets.push({
        sheetId,
        title: properties?.title ?? '',
        rows,
        merges: (sheet.merges ?? []).map((m) => ({
          sheetId,
          startRowIndex: m.startRowIndex ?? 0,
          endRowIndex: m.endRowIndex ?? 0,
          startColumnIndex: m.startColumnIndex ?? 0,
          endColumnIndex: m.endColumnIndex ?? 0,
        })),
      });
    }
    return { sheets, spreadsheetTitle: metadata.data.properties?.title ?? '' };
  }
  return {
    ...drive,
    authorizationUrl(state, nonce) {
      const generated = client().generateAuthUrl({
        state,
        scope: [
          'openid',
          'email',
          'https://www.googleapis.com/auth/drive.metadata.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
        ],
        access_type: 'offline',
        prompt: 'select_account consent',
      });
      if (!nonce) return generated;
      const url = new URL(generated);
      url.searchParams.set('nonce', nonce);
      return url.href;
    },
    async verifiedIdentity(credentials, nonce) {
      if (!credentials.id_token) throw new AppError('GOOGLE_AUTH_REQUIRED');
      try {
        const ticket = await client().verifyIdToken({
          idToken: credentials.id_token,
          audience: config.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload?.sub || (payload as { nonce?: string }).nonce !== nonce)
          throw new AppError('GOOGLE_AUTH_REQUIRED');
        return googleIdentitySchema.parse({
          sub: payload.sub,
          email: payload.email ?? '',
          displayName: payload.name ?? payload.email ?? '',
        });
      } catch {
        throw new AppError('GOOGLE_AUTH_REQUIRED');
      }
    },
    async exchange(code) {
      try {
        return (await client().getToken(code)).tokens;
      } catch (error) {
        throw googleError(error);
      }
    },
    async write(spreadsheetId, credentials, updates) {
      const auth = client();
      auth.setCredentials(credentials);
      auth.on('tokens', (tokens) => Object.assign(credentials, tokens));
      try {
        await google.sheets({ version: 'v4', auth }).spreadsheets.batchUpdate(
          {
            spreadsheetId,
            requestBody: {
              requests: updates.map(({ target, answer }) => ({
                updateCells: {
                  start: {
                    sheetId: target.sheetId,
                    rowIndex: target.rowIndex,
                    columnIndex: target.columnIndex,
                  },
                  rows: [{ values: [{ userEnteredValue: { stringValue: answer } }] }],
                  fields: 'userEnteredValue',
                },
              })),
            },
          },
          { timeout: 15000, retry: false },
        );
      } catch (error) {
        throw googleError(error);
      }
    },
    async read(spreadsheetId, credentials) {
      return (await readGrids(spreadsheetId, credentials, 'all')).sheets;
    },
    async readFirstSheet(spreadsheetId, credentials) {
      const result = await readGrids(spreadsheetId, credentials, 'first');
      return { spreadsheetTitle: result.spreadsheetTitle, sheet: result.sheets[0]! };
    },
    async readSheetById(spreadsheetId, sheetId, credentials) {
      return (await readGrids(spreadsheetId, credentials, sheetId)).sheets[0]!;
    },
  };
}
