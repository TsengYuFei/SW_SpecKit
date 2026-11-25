import { useEffect, useRef, useState } from 'react';
import { sourcePreviewSchema, type SourcePreview } from '@classroom/shared/schemas/source';
import {
  catalogPageSchema,
  catalogPreviewSchema,
  catalogCreatedSchema,
  type CatalogPreview,
  type SpreadsheetCandidate,
} from '@classroom/shared/schemas/catalog';
import { http } from '../transport/http';
import { newRequestId } from '../transport/request-id';
import type { Phase } from '@classroom/shared/schemas/common';

interface Props {
  csrfToken: string;
  currentActivityId: string | null;
  onActivity?: (activityId: string) => void;
  phase?: Phase;
  writebackPending?: boolean;
}
export function SourcePage({
  csrfToken,
  currentActivityId,
  onActivity,
  phase,
  writebackPending,
}: Props) {
  const [activity, setActivity] = useState<SourcePreview | null>(null);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [items, setItems] = useState<SpreadsheetCandidate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loadedQuery, setLoadedQuery] = useState('');
  const [groupCount, setGroupCount] = useState(2);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false),
    [configured, setConfigured] = useState(true);
  const [account, setAccount] = useState<{ displayName: string; email: string } | null>(null);
  const [incomplete, setIncomplete] = useState(false),
    [listed, setListed] = useState(false);
  const alive = useRef(true);
  const pendingCreate = useRef<{ requestId: string; previewId: string; groupCount: number } | null>(
    null,
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (activity) onActivity?.(activity.activityId);
  }, [activity, onActivity]);
  async function loadCatalog(search: string, cursor?: string) {
    const params = new URLSearchParams({ query: search });
    if (cursor) params.set('cursor', cursor);
    const page = catalogPageSchema.parse(
      await http('/api/google/spreadsheets?' + params.toString()),
    );
    if (!alive.current) return;
    setItems((previous) =>
      cursor
        ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))]
        : page.items,
    );
    setNextCursor(page.nextCursor);
    setIncomplete((previous) =>
      cursor ? previous || page.incompleteSearch : page.incompleteSearch,
    );
    setLoadedQuery(search);
    setListed(true);
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : '操作失敗，請稍後重試。');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await http<{
          authorized: boolean;
          configured: boolean;
          account: { displayName: string; email: string } | null;
          error?: { message: string };
        }>('/api/google/status');
        if (!active || !alive.current) return;
        setAuthorized(status.authorized);
        setConfigured(status.configured);
        setAccount(status.account);
        if (status.error) setError(status.error.message);
        if (currentActivityId) {
          const saved = sourcePreviewSchema.parse(
            await http('/api/activities/' + currentActivityId),
          );
          if (active && alive.current) setActivity(saved);
        }
        if (status.authorized) await loadCatalog('');
      } catch (error) {
        if (active && alive.current)
          setError(error instanceof Error ? error.message : '無法載入教材。');
      }
    })();
    return () => {
      active = false;
    };
  }, [currentActivityId]);
  const blocked = Boolean(activity && (phase ?? activity.phase) !== 'ended');
  return (
    <section aria-labelledby="source-heading">
      <h2 id="source-heading">選擇線上教材</h2>
      {!configured && <p>請先完成本機 Google 連線設定，再進行授權。</p>}
      {account && (
        <p>
          目前帳號：{account.displayName}（{account.email}）
        </p>
      )}
      <button
        disabled={busy || !configured}
        onClick={() =>
          void perform(async () => {
            const result = await http<{ url: string }>('/api/google/connect', csrfToken, {});
            window.location.assign(result.url);
          })
        }
      >
        {authorized ? '重新授權 Google' : '授權 Google Sheets'}
      </button>
      {authorized && (
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await http('/api/google/disconnect', csrfToken, {});
              if (!alive.current) return;
              setAuthorized(false);
              setAccount(null);
              setActivity(null);
              setPreview(null);
              setItems([]);
              setNextCursor(null);
              setListed(false);
            })
          }
        >
          切換或解除帳號連結
        </button>
      )}
      {authorized && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                setPreview(null);
                await loadCatalog(query);
              });
            }}
          >
            <label>
              搜尋試算表
              <input
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button disabled={busy}>搜尋教材</button>
          </form>
          {incomplete && <p role="status">搜尋尚未完整，請繼續載入或縮小搜尋範圍。</p>}
          {listed && items.length === 0 && !nextCursor && <p>目前沒有符合搜尋條件的試算表。</p>}
          {listed && items.length === 0 && nextCursor && (
            <p>這一頁沒有項目，仍有更多教材可載入。</p>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> — {item.ownerLabel ?? item.id}
                {item.modifiedTime ? ' — ' + item.modifiedTime : ''}
                {!item.canEdit && <span>（唯讀，無法建立可回填活動）</span>}
                <button
                  disabled={busy || !item.canEdit}
                  onClick={() =>
                    void perform(async () => {
                      setPreview(null);
                      pendingCreate.current = null;
                      const value = catalogPreviewSchema.parse(
                        await http('/api/source-previews', csrfToken, { spreadsheetId: item.id }),
                      );
                      if (alive.current) setPreview(value);
                    })
                  }
                >
                  預覽 {item.name}（{item.id}）
                </button>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button
              disabled={busy}
              onClick={() => void perform(() => loadCatalog(loadedQuery, nextCursor))}
            >
              載入更多教材
            </button>
          )}
        </>
      )}
      {preview && (
        <>
          <h3>核對第一個工作表：{preview.source.sheetTitle}</h3>
          <p>來源：{preview.source.title}；僅使用第一個工作表的題目。</p>
          {preview.questions.map((question) => (
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
                    第 {item.target.rowIndex + 1} 列、第 {item.target.columnIndex + 1} 欄
                  </small>
                </p>
              ))}
            </article>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                if (
                  pendingCreate.current &&
                  (pendingCreate.current.previewId !== preview.previewId ||
                    pendingCreate.current.groupCount !== groupCount)
                )
                  throw new Error('上一個建立結果尚未確認，請先使用原設定重試。');
                const body = pendingCreate.current ?? {
                  requestId: newRequestId(),
                  previewId: preview.previewId,
                  groupCount,
                };
                pendingCreate.current = body;
                const created = catalogCreatedSchema.parse(
                  await http('/api/activities', csrfToken, body),
                );
                pendingCreate.current = null;
                if (!alive.current) return;
                setActivity(
                  sourcePreviewSchema.parse({
                    activityId: created.activityId,
                    phase: created.phase,
                    groupCount: created.groupCount,
                    source: created.source,
                  }),
                );
                setPreview(null);
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
            <button disabled={busy || blocked || writebackPending}>確認題目並建立活動</button>
          </form>
          {blocked && <p>目前活動尚未結束，請完成後再建立下一場。</p>}
        </>
      )}
      {activity && <p>已建立活動，共 {activity.groupCount} 組，教材已確認。</p>}
      {busy && <p role="status">正在處理，請稍候…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
