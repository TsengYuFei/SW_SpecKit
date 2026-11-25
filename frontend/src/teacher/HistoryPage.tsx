import { useEffect, useRef, useState } from 'react';
import { historyPageSchema, type historySummarySchema } from '@classroom/shared/schemas/history';
import type { z } from 'zod';
import { HistoryDetailPage } from './HistoryDetailPage';
import { OperationStatus } from '../components/OperationStatus';
import { http } from '../transport/http';
export function HistoryPage({ csrfToken }: { csrfToken: string }) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [items, setItems] = useState<z.infer<typeof historySummarySchema>[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const page = historyPageSchema.parse(
        await http('/api/activities' + (next ? '?cursor=' + encodeURIComponent(next) : '')),
      );
      if (!alive.current) return;
      setItems((previous) =>
        next
          ? [
              ...previous,
              ...page.items.filter((item) => !previous.some((old) => old.id === item.id)),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : '無法讀取歷史。');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void http('/api/activities')
      .then((value) => {
        if (active) {
          const page = historyPageSchema.parse(value);
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '無法讀取歷史。');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section id="history" aria-label="歷史活動">
      <h2>歷史活動</h2>
      {selected ? (
        <HistoryDetailPage
          key={selected}
          activityId={selected}
          csrfToken={csrfToken}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <button disabled={busy} onClick={() => void load()}>
            更新歷史清單
          </button>
          {items.length === 0 && !busy && !error && <p>目前沒有已保存活動。</p>}
          <ul className="history-list">
            {items.map((item) => (
              <li key={item.id}>
                <button onClick={() => setSelected(item.id)}>
                  查看 {item.spreadsheetTitle}（{new Date(item.createdAt).toLocaleString('zh-TW')}）
                </button>{' '}
                —{' '}
                {item.phase === 'waiting'
                  ? '等待開始'
                  : item.phase === 'active'
                    ? '進行中'
                    : '已結束'}{' '}
                — 回填
                {
                  {
                    idle: '尚未開始',
                    writing: '處理中',
                    pending: '待確認',
                    verified: '已確認',
                    conflict: '衝突',
                    failed: '失敗',
                  }[item.writebackSummary]
                }
              </li>
            ))}
          </ul>
          {cursor && (
            <button disabled={busy} onClick={() => void load(cursor)}>
              載入更多歷史
            </button>
          )}
          {busy && <OperationStatus kind="loading">正在讀取歷史…</OperationStatus>}
          {error && <OperationStatus kind="error">{error}</OperationStatus>}
        </>
      )}
    </section>
  );
}
