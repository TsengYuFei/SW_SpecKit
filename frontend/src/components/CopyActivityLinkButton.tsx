import { useEffect, useId, useRef, useState } from 'react';
import type { OperationScope } from '../transport/download';

export function isStudentLink(value: string, activityId: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === `/student/${activityId}`
    );
  } catch {
    return false;
  }
}

export function CopyActivityLinkButton({
  studentUrl,
  scope,
}: {
  studentUrl: string;
  scope: Omit<OperationScope, 'epoch'>;
}) {
  const key = JSON.stringify([
    studentUrl,
    scope.activityId,
    scope.bootId,
    scope.sessionVersion,
    scope.authGeneration,
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0),
    alive = useRef(true),
    pending = useRef(false);
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle');
  const inputId = useId();
  const validLink = isStudentLink(studentUrl, scope.activityId);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    setState('idle');
    return () => {
      alive.current = false;
      epoch.current++;
      pending.current = false;
    };
  }, [key]);

  async function copy() {
    if (!validLink || pending.current) return;
    const captured = key,
      operation = ++epoch.current;
    const valid = () =>
      alive.current && current.current === captured && epoch.current === operation;
    pending.current = true;
    setState('pending');
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('UNAVAILABLE');
      // Invoke inside the user gesture, before any asynchronous work.
      await navigator.clipboard.writeText(studentUrl);
      if (valid()) setState('copied');
    } catch {
      if (valid()) setState('error');
    } finally {
      if (valid()) pending.current = false;
    }
  }

  return (
    <div className="copy-activity-link">
      <button disabled={!validLink || state === 'pending'} onClick={() => void copy()}>
        複製活動連結
      </button>
      {!validLink && <p>目前沒有有效的學生加入連結。</p>}
      {validLink && state === 'pending' && <p role="status">正在複製活動連結…</p>}
      {validLink && state === 'copied' && <p role="status">已複製活動連結</p>}
      {validLink && state === 'error' && (
        <>
          <p role="alert">無法自動複製，請手動複製下方活動連結。</p>
          <label htmlFor={inputId}>手動複製活動連結</label>
          <input
            id={inputId}
            readOnly
            value={studentUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="control-hint">選取網址後，按 Ctrl+C 或使用裝置的複製功能。</p>
        </>
      )}
    </div>
  );
}
