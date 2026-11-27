import { useEffect, useRef, useState } from 'react';
import { downloadResults, type TeacherScope } from '../transport/download';
export function ExportResultsButton({
  activityId,
  phase,
  csrfToken,
  scope,
}: {
  activityId: string;
  phase: string;
  csrfToken: string;
  scope: TeacherScope;
}) {
  const key = JSON.stringify([
    activityId,
    scope.bootId,
    scope.sessionVersion,
    scope.authGeneration,
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'started' | 'error'>('idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setState('idle');
    setMessage('');
    return () => {
      epoch.current++;
      controller.current?.abort();
    };
  }, [key]);
  async function download() {
    if (state === 'loading' || phase !== 'ended') return;
    const operation = ++epoch.current,
      captured = key;
    const abort = new AbortController();
    controller.current = abort;
    const valid = () =>
      !abort.signal.aborted && epoch.current === operation && current.current === captured;
    setState('loading');
    setMessage('');
    try {
      await downloadResults({
        scope: { ...scope, activityId, epoch: operation },
        csrfToken,
        signal: abort.signal,
        isCurrent: valid,
      });
      if (valid()) {
        setState('started');
        setMessage('已開始下載');
      }
    } catch (error) {
      if (valid()) {
        setState('error');
        setMessage(error instanceof Error ? error.message : '無法匯出結果，未開始下載。');
      }
    }
  }
  return (
    <div className="result-export">
      <button disabled={phase !== 'ended' || state === 'loading'} onClick={() => void download()}>
        下載本場 CSV
      </button>
      {phase !== 'ended' && <p>活動結束後才能匯出結果。</p>}
      <p className="control-hint">
        CSV供Excel檢視；可能被當成公式的內容會加安全文字前綴，原受理答案不變。轉存或供其他程式處理時請重新確認文字解讀。
      </p>
      {state === 'loading' && <p role="status">正在準備下載…</p>}
      {message && <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>}
    </div>
  );
}
