import { beforeEach, expect, it, vi } from 'vitest';
import { createGoogleGateway } from '../../backend/src/google/sheets-client.js';
import { readConfig } from '../../backend/src/config.js';

const rpc = vi.hoisted(() => ({ get: vi.fn(), getByDataFilter: vi.fn(), batchUpdate: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
    sheets: () => ({ spreadsheets: rpc }),
  },
}));

const config = { GOOGLE_CLIENT_ID: 'invalid-demo-id', GOOGLE_CLIENT_SECRET: 'invalid-demo-value' };
beforeEach(() => {
  vi.resetAllMocks();
  rpc.get.mockResolvedValue({
    data: {
      sheets: [
        {
          properties: {
            sheetId: 7,
            title: '任意分頁',
            sheetType: 'GRID',
            gridProperties: { rowCount: 1001, columnCount: 5 },
          },
        },
      ],
    },
  });
});

it('writes a complete question using one batch of exact stringValue cells and no format updates', async () => {
  rpc.batchUpdate.mockResolvedValue({ data: {} });
  const updates = [1, 2].map((rowIndex) => ({
    target: { sheetId: 7, rowIndex, columnIndex: 4, mergeRange: null },
    answer: '=SUM(A1)',
  }));
  await createGoogleGateway(readConfig(config)).write('example_sheet', {}, updates);
  expect(rpc.batchUpdate).toHaveBeenCalledTimes(1);
  const [params, options] = rpc.batchUpdate.mock.calls[0]!;
  expect(params.requestBody.requests).toEqual(
    updates.map(({ target, answer }) => ({
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
  );
  expect(options).toMatchObject({ timeout: 15000, retry: false });
});

it('reads every row chunk using sheet IDs and preserves offsets', async () => {
  rpc.getByDataFilter.mockImplementation(async (params) => {
    const range = params.requestBody.dataFilters[0].gridRange;
    return {
      data: {
        sheets: [
          {
            properties: { sheetId: 7 },
            data: [
              {
                startRow: range.startRowIndex,
                rowData: [{ values: [{ userEnteredValue: { stringValue: '內容' } }] }],
              },
            ],
          },
        ],
      },
    };
  });
  const sheets = await createGoogleGateway(readConfig(config)).read('example_sheet', {});
  expect(rpc.getByDataFilter).toHaveBeenCalledTimes(3);
  expect(sheets[0]!.rows[500]![0]!.userEnteredValue?.stringValue).toBe('內容');
  expect(sheets[0]!.rows[1000]![0]!.userEnteredValue?.stringValue).toBe('內容');
  expect(rpc.get.mock.calls[0]![0]).toMatchObject({ fields: 'sheets(properties,merges)' });
});

it('rejects oversized source grids before downloading cells', async () => {
  const gateway = createGoogleGateway(readConfig({ ...config, MAX_SOURCE_CELLS: '1' }));
  await expect(gateway.read('example_sheet', {})).rejects.toMatchObject({
    code: 'SOURCE_TOO_LARGE',
  });
  expect(rpc.getByDataFilter).not.toHaveBeenCalled();
});

it('rejects the entire read when a later chunk fails', async () => {
  rpc.getByDataFilter
    .mockResolvedValueOnce({ data: { sheets: [{ properties: { sheetId: 7 }, data: [] }] } })
    .mockRejectedValue({ response: { status: 403 } });
  await expect(
    createGoogleGateway(readConfig(config)).read('example_sheet', {}),
  ).rejects.toMatchObject({ code: 'GOOGLE_FORBIDDEN' });
});
