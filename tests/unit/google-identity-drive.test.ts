import { beforeEach, expect, it, vi } from 'vitest';
import { createGoogleGateway } from '../../backend/src/google/sheets-client.js';
import { readConfig } from '../../backend/src/config.js';
const rpc = vi.hoisted(() => ({ verify: vi.fn(), url: vi.fn(), list: vi.fn(), get: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
        generateAuthUrl(input: unknown) {
          return rpc.url(input);
        }
        verifyIdToken(input: unknown) {
          return rpc.verify(input);
        }
      },
    },
    drive: () => ({ files: { list: rpc.list, get: rpc.get } }),
  },
}));
const config = readConfig({
  GOOGLE_CLIENT_ID: 'invalid-demo-id',
  GOOGLE_CLIENT_SECRET: 'invalid-demo-value',
});
beforeEach(() => {
  vi.resetAllMocks();
});
it('requests OIDC, Drive metadata and Sheets scopes with account selection and a nonce', () => {
  rpc.url.mockReturnValue('https://accounts.example.invalid/authorize');
  const url = new URL(
    createGoogleGateway(config).authorizationUrl('synthetic-state', 'synthetic-nonce'),
  );
  expect(url.searchParams.get('nonce')).toBe('synthetic-nonce');
  expect(rpc.url).toHaveBeenCalledWith(
    expect.objectContaining({
      state: 'synthetic-state',
      prompt: 'select_account consent',
      scope: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    }),
  );
});
it('verifies the token audience through the SDK and binds its nonce before exposing identity', async () => {
  rpc.verify.mockResolvedValue({
    getPayload: () => ({ sub: 'test-owner-a', nonce: 'n', email: 'a@example.invalid', name: 'A' }),
  });
  const gateway = createGoogleGateway(config);
  expect(await gateway.verifiedIdentity!({ id_token: 'invalid-demo-id-token' }, 'n')).toMatchObject(
    { sub: 'test-owner-a' },
  );
  expect(rpc.verify).toHaveBeenCalledWith({
    idToken: 'invalid-demo-id-token',
    audience: 'invalid-demo-id',
  });
  await expect(
    gateway.verifiedIdentity!({ id_token: 'invalid-demo-id-token' }, 'wrong'),
  ).rejects.toMatchObject({ code: 'GOOGLE_AUTH_REQUIRED' });
  await expect(gateway.verifiedIdentity!({}, 'n')).rejects.toMatchObject({
    code: 'GOOGLE_AUTH_REQUIRED',
  });
  rpc.verify.mockRejectedValue(new Error('invalid-demo-private-canary'));
  await expect(
    gateway.verifiedIdentity!({ id_token: 'invalid-demo-id-token' }, 'n'),
  ).rejects.toMatchObject({ code: 'GOOGLE_AUTH_REQUIRED' });
});
it('escapes Drive searches and keeps shared-drive, permission and incomplete-page metadata', async () => {
  rpc.list.mockResolvedValue({
    data: {
      files: [{ id: 'shared-sheet', name: '同名教材', capabilities: { canEdit: true } }],
      nextPageToken: 'opaque-provider-token',
      incompleteSearch: true,
    },
  });
  const page = await createGoogleGateway(config).listSpreadsheets!(
    {},
    { query: "A'\\B", pageToken: 'prior' },
  );
  expect(page).toMatchObject({
    items: [{ id: 'shared-sheet', canEdit: true }],
    nextPageToken: 'opaque-provider-token',
    incompleteSearch: true,
  });
  expect(rpc.list.mock.calls[0]![0]).toMatchObject({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'A\\'\\\\B'",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
    pageToken: 'prior',
  });
  expect(rpc.list.mock.calls[0]![1]).toEqual({ timeout: 15000, retry: false });
});
it('treats missing edit capability as read-only and rejects non-native or trashed files', async () => {
  const gateway = createGoogleGateway(config);
  rpc.get.mockResolvedValue({
    data: { name: '唯讀', mimeType: 'application/vnd.google-apps.spreadsheet' },
  });
  expect(await gateway.getFileCapability!('sheet', {})).toMatchObject({ canEdit: false });
  rpc.get.mockResolvedValue({
    data: { mimeType: 'application/vnd.google-apps.spreadsheet', trashed: true },
  });
  await expect(gateway.getFileCapability!('sheet', {})).rejects.toMatchObject({
    code: 'SHEET_NOT_FOUND_OR_INACCESSIBLE',
  });
  rpc.get.mockResolvedValue({
    data: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
  await expect(gateway.getFileCapability!('sheet', {})).rejects.toMatchObject({
    code: 'SHEET_NOT_FOUND_OR_INACCESSIBLE',
  });
});
