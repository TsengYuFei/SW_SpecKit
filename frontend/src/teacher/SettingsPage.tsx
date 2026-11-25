import { useEffect, useRef, useState } from 'react';
import { settingsSchema } from '@classroom/shared/schemas/settings';
import { http, HttpError } from '../transport/http';
import { newRequestId } from '../transport/request-id';
import { OperationStatus } from '../components/OperationStatus';
export function SettingsPage({ csrfToken, onSaved }: { csrfToken: string; onSaved: () => void }) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [count, setCount] = useState(2),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ requestId: string; defaultGroupCount: number } | null>(null);
  useEffect(() => {
    let active = true;
    void http('/api/settings')
      .then((value) => {
        if (active) setCount(settingsSchema.parse(value).defaultGroupCount);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '無法讀取設定。');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section id="settings" aria-label="老師設定">
      <h2>老師設定</h2>
      <p className="muted">預設組數會套用到下一場活動，並依目前 Google 帳號保存。</p>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setSaved(false);
          void (async () => {
            if (pending.current && pending.current.defaultGroupCount !== count)
              throw new Error('上一筆設定尚未確認，請以原內容重試。');
            const body = pending.current ?? { requestId: newRequestId(), defaultGroupCount: count };
            pending.current = body;
            const value = settingsSchema.parse(await http('/api/settings', csrfToken, body));
            if (!alive.current) return;
            pending.current = null;
            setCount(value.defaultGroupCount);
            setSaved(true);
            onSaved();
          })()
            .catch((error) => {
              if (!alive.current) return;
              if (error instanceof HttpError) pending.current = null;
              setError(error instanceof Error ? error.message : '設定尚未保存。');
            })
            .finally(() => {
              if (alive.current) setBusy(false);
            });
        }}
      >
        <label>
          預設參與組數
          <input
            type="number"
            disabled={busy}
            required
            min={1}
            max={10000}
            step={1}
            value={count}
            onChange={(event) => {
              setCount(Number(event.target.value));
              setSaved(false);
            }}
          />
        </label>
        <button disabled={busy}>保存老師設定</button>
      </form>
      {busy && <OperationStatus kind="loading">正在讀取或保存設定，請稍候…</OperationStatus>}
      {saved && <OperationStatus kind="success">老師設定已保存。</OperationStatus>}
      {error && <OperationStatus kind="error">{error}</OperationStatus>}
    </section>
  );
}
