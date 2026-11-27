import { afterEach, expect, it, vi } from 'vitest';
import {
  attachmentFilename,
  downloadResults,
  downloadErrorMessage,
} from '../../frontend/src/transport/download.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const scope = {
  activityId: '11111111-1111-4111-8111-111111111111',
  bootId: 'invalid-demo-boot',
  sessionVersion: 0,
  authGeneration: 1,
  epoch: 1,
};
function setup(response: Response) {
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } });
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid-demo');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const controller = new AbortController();
  return {
    anchor,
    fetch,
    create,
    revoke,
    controller,
    input: {
      scope,
      csrfToken: 'invalid-demo-csrf',
      signal: controller.signal,
      isCurrent: () => true,
    },
  };
}
const response = () =>
  new Response(new Uint8Array([239, 187, 191, 97]), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        'attachment; filename="fallback.csv"; filename*=UTF-8\'\'%E4%B8%AD%E6%96%87.csv',
    },
  });
it('never trusts arbitrary exception text or a forged safe error name at the UI boundary', async () => {
  const arbitrary = new Error('invalid-demo-private');
  arbitrary.name = 'DownloadFailure';
  expect(downloadErrorMessage(arbitrary)).toBe('無法匯出結果，未開始下載。');
  expect(downloadErrorMessage('invalid-demo-private')).toBe('無法匯出結果，未開始下載。');
  const c = setup(Response.json({ ok: false, error: { code: 'EXPORT_BUSY' } }, { status: 503 }));
  try {
    await downloadResults(c.input);
  } catch (error) {
    expect(downloadErrorMessage(error)).toBe('匯出暫時忙碌或逾時，請稍後手動重試。');
    return;
  }
  throw new Error('EXPECTED_SAFE_FAILURE');
});
it('keeps BOM bytes, chooses filename*, clicks once and cleans its object URL on abort', async () => {
  const c = setup(response());
  await downloadResults(c.input);
  expect(c.anchor.download).toBe('中文.csv');
  expect(c.anchor.click).toHaveBeenCalledOnce();
  expect([...new Uint8Array(await (c.create.mock.calls[0]![0] as Blob).arrayBuffer())]).toEqual([
    239, 187, 191, 97,
  ]);
  c.controller.abort();
  expect(c.revoke).toHaveBeenCalledOnce();
  expect(c.anchor.remove).toHaveBeenCalledOnce();
});
it.each(['application/json', 'text/html', 'text/plain'])(
  'never downloads a 200 %s response',
  async (type) => {
    const c = setup(new Response('{"ok":false}', { headers: { 'content-type': type } }));
    await expect(downloadResults(c.input)).rejects.toThrow();
    expect(c.anchor.click).not.toHaveBeenCalled();
    expect(c.create).not.toHaveBeenCalled();
  },
);
it('maps safe error codes without reflecting error payloads', async () => {
  const c = setup(
    Response.json(
      { ok: false, error: { code: 'EXPORT_BUSY', message: 'invalid-demo-private' }, revision: 0 },
      { status: 503 },
    ),
  );
  await expect(downloadResults(c.input)).rejects.toThrow('匯出暫時忙碌');
  expect(c.create).not.toHaveBeenCalled();
});

it('rejects a truncated body even when success headers claim CSV', async () => {
  const c = setup(
    new Response('x', {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="invalid-demo.csv"',
      },
    }),
  );
  await expect(downloadResults(c.input)).rejects.toThrow('下載內容不完整');
  expect(c.create).not.toHaveBeenCalled();
  expect(c.anchor.click).not.toHaveBeenCalled();
});
it.each(['after-fetch', 'after-body', 'after-url', 'body-failure'] as const)(
  'cancels %s before any anchor activation and releases resources',
  async (when) => {
    const res = response(),
      c = setup(res);
    let current = true;
    if (when === 'after-fetch')
      c.fetch.mockImplementation(async () => {
        current = false;
        return res;
      });
    if (when === 'after-body')
      vi.spyOn(res, 'blob').mockImplementation(async () => {
        current = false;
        return new Blob(['x']);
      });
    if (when === 'after-url')
      c.create.mockImplementation(() => {
        current = false;
        return 'blob:invalid-demo';
      });
    if (when === 'body-failure')
      vi.spyOn(res, 'blob').mockRejectedValue(new TypeError('invalid-demo-network'));
    await expect(downloadResults({ ...c.input, isCurrent: () => current })).rejects.toThrow();
    expect(c.anchor.click).not.toHaveBeenCalled();
    if (when === 'after-url') expect(c.revoke).toHaveBeenCalledOnce();
    else expect(c.create).not.toHaveBeenCalled();
  },
);
it.each([
  null,
  'inline; filename="x.csv"',
  'attachment; filename="../x.csv"',
  "attachment; filename*=UTF-8''%xx.csv",
  'attachment; filename="x.html"',
  'attachment; filename="fallback.csv"; filename*=invalid-encoding\'\'x.csv',
])('rejects unsafe attachment %j', (header) => expect(() => attachmentFilename(header)).toThrow());
