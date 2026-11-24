import { useEffect, useState } from 'react';
import { sourcePreviewSchema, type SourcePreview } from '@classroom/shared/schemas/source';
import { http } from '../transport/http';
import type { Phase } from '@classroom/shared/schemas/common';

function parsePreview(value: unknown): SourcePreview {
  const parsed = sourcePreviewSchema.safeParse(value);
  if (!parsed.success) throw new Error('伺服器回覆不完整，請重新載入頁面。');
  return parsed.data;
}
interface Props {
  csrfToken: string;
  currentActivityId: string | null;
  onActivity?: (activityId: string) => void;
  phase?: Phase;
}
export function SourcePage({ csrfToken, currentActivityId, onActivity, phase }: Props) {
  const [activity, setActivity] = useState<SourcePreview | null>(null);
  const [groupCount, setGroupCount] = useState(2);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [configured, setConfigured] = useState(true);
  useEffect(() => {
    if (activity) onActivity?.(activity.activityId);
  }, [activity, onActivity]);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const status = await http<{
          authorized: boolean;
          configured: boolean;
          error?: { message: string };
        }>('/api/google/status');
        if (!active) return;
        setAuthorized(status.authorized);
        setConfigured(status.configured);
        if (status.error) setError(status.error.message);
        if (currentActivityId) {
          const preview = parsePreview(await http(`/api/activities/${currentActivityId}`));
          if (active) setActivity(preview);
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : '載入失敗');
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [currentActivityId]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失敗');
      if (activity) {
        try {
          setActivity(parsePreview(await http(`/api/activities/${activity.activityId}`)));
        } catch {
          setActivity({ ...activity, source: null });
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const source = activity?.source;
  return (
    <section aria-labelledby="source-heading">
      <h2 id="source-heading">連線教材</h2>
      {!configured && (
        <p>請先在本機執行環境設定 GOOGLE_CLIENT_ID 與 GOOGLE_CLIENT_SECRET，重新啟動服務後授權。</p>
      )}
      <button
        disabled={busy || !configured}
        onClick={() =>
          void perform(async () => {
            const { url } = await http<{ url: string }>('/api/google/start', csrfToken, {});
            window.location.assign(url);
          })
        }
      >
        {authorized ? '重新授權 Google' : '授權 Google Sheets'}
      </button>
      {(!activity || phase === 'ended') && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              setActivity(parsePreview(await http('/api/activities', csrfToken, { groupCount })));
            });
          }}
        >
          <label>
            可參與組數
            <input
              type="number"
              min="1"
              step="1"
              required
              value={groupCount}
              onChange={(event) => setGroupCount(Number(event.target.value))}
            />
          </label>
          <button disabled={busy}>{activity ? '建立下一場活動' : '建立活動'}</button>
        </form>
      )}
      {activity && (
        <>
          <p>本活動共 {activity.groupCount} 組</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                setActivity(
                  parsePreview(
                    await http(`/api/activities/${activity.activityId}/source`, csrfToken, {
                      spreadsheetUrlOrId: input,
                    }),
                  ),
                );
              });
            }}
          >
            <label>
              Google Sheets URL 或 Spreadsheet ID
              <input
                required
                maxLength={2048}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button disabled={busy || !authorized || (phase ?? activity.phase) !== 'waiting'}>
              讀取線上題目
            </button>
          </form>
          {source?.loadState === 'ready' && !busy && (
            <>
              <h3>核對題目與填空位置</h3>
              {source.questions.map((question) => (
                <article key={question.id}>
                  <h4>
                    第 {question.displayNumber} 題
                    {question.kind === 'group' ? '（題組，須全部作答後送出）' : ''}
                  </h4>
                  {question.items.map((item) => (
                    <p key={item.id}>
                      {item.label} {item.prompt}
                      <br />
                      <small>
                        分頁 ID {item.target.sheetId}，第 {item.target.rowIndex + 1} 列、第{' '}
                        {item.target.columnIndex + 1} 欄
                      </small>
                    </p>
                  ))}
                </article>
              ))}
              <button
                disabled={busy || source.confirmed || (phase ?? activity.phase) !== 'waiting'}
                onClick={() =>
                  void perform(async () => {
                    setActivity(
                      parsePreview(
                        await http(
                          `/api/activities/${activity.activityId}/source/confirm`,
                          csrfToken,
                          { mappingVersion: source.mappingVersion },
                        ),
                      ),
                    );
                  })
                }
              >
                {source.confirmed ? '對應已確認' : '確認題目及填空對應'}
              </button>
            </>
          )}
        </>
      )}
      {busy && <p role="status">正在處理，請稍候…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
