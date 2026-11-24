import { google } from 'googleapis';
import { setTimeout as sleep } from 'node:timers/promises';
import type { GridSheet } from '@classroom/shared/schemas/source';
import type { Config } from '../config.js';
import { AppError } from '../security/safe-errors.js';

export type TokenSet = InstanceType<typeof google.auth.OAuth2>['credentials'];
export interface GoogleGateway {
  authorizationUrl(state: string): string;
  exchange(code: string): Promise<TokenSet>;
  read(spreadsheetId: string, credentials: TokenSet): Promise<GridSheet[]>;
}
export function googleError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const data = error as { response?: { status?: number }; code?: string | number } | null;
  const status = data?.response?.status ?? Number(data?.code);
  if (status === 400) return new AppError('INVALID_INPUT');
  if (status === 401) return new AppError('GOOGLE_AUTH_REQUIRED');
  if (status === 403) return new AppError('GOOGLE_FORBIDDEN');
  if (status === 404) return new AppError('SHEET_NOT_FOUND_OR_INACCESSIBLE');
  if (status === 429) return new AppError('RATE_LIMITED');
  if (
    ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(
      String(data?.code),
    )
  )
    return new AppError('NETWORK_ERROR');
  return new AppError('GOOGLE_ERROR');
}
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
  return {
    authorizationUrl(state) {
      return client().generateAuthUrl({
        state,
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        access_type: 'offline',
        prompt: 'consent',
      });
    },
    async exchange(code) {
      try {
        return (await client().getToken(code)).tokens;
      } catch (error) {
        throw googleError(error);
      }
    },
    async read(spreadsheetId, credentials) {
      const auth = client();
      auth.setCredentials(credentials);
      auth.on('tokens', (tokens) => Object.assign(credentials, tokens));
      const api = google.sheets({ version: 'v4', auth });
      const metadata = await readWithRetry(() =>
        api.spreadsheets.get(
          { spreadsheetId, fields: 'sheets(properties,merges)' },
          { timeout: 15000, retry: false },
        ),
      );
      const sheets: GridSheet[] = [];
      let cellCount = 0;
      for (const sheet of metadata.data.sheets ?? []) {
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
      return sheets;
    },
  };
}
