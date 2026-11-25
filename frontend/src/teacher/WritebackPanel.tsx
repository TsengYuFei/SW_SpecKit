import { useRef, useState } from 'react';
import {
  writebackSchema,
  type Writeback,
  type WriteStatus,
} from '@classroom/shared/schemas/writeback';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { http, HttpError } from '../transport/http';
import { newRequestId } from '../transport/request-id';

const labels: Record<WriteStatus, string> = {
  idle: '尚未回寫',
  writing: '回寫中',
  pending: '待確認',
  verified: '讀回已確認',
  conflict: '來源衝突',
  failed: '回寫失敗',
};
export function WritebackPanel({
  snapshot,
  csrfToken,
  connected,
}: {
  snapshot: ActivitySnapshot;
  csrfToken: string;
  connected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [local, setLocal] = useState<Writeback | null>(null);
  const requestId = useRef<string | null>(null);
  const remote = snapshot.writebacks?.at(-1);
  const operation =
    !local || snapshot.writebacks?.some((op) => op.operationId === local.operationId)
      ? remote
      : local;
  const unsettled =
    snapshot.writebacks?.some((op) => op.status === 'writing' || op.status === 'pending') ||
    operation?.status === 'writing' ||
    operation?.status === 'pending';
  async function perform(verify: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    const base = `/api/activities/${snapshot.activityId}/writeback`;
    try {
      const response =
        verify && operation
          ? await http(`${base}/${operation.operationId}/verify`, csrfToken, {})
          : await http(base, csrfToken, { requestId: (requestId.current ??= newRequestId()) });
      setLocal(writebackSchema.parse(response));
      requestId.current = null;
    } catch (error) {
      if (error instanceof HttpError) requestId.current = null;
      setError(error instanceof Error ? error.message : '回寫狀態尚未確認，請重新連線查核。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="回寫線上教材">
      <h2>回寫線上教材</h2>
      <p>回寫前請暫停在其他視窗編輯此試算表。系統會核對原題目與填空位置，並讀回確認答案。</p>
      <button
        disabled={!connected || busy || unsettled || !snapshot.results?.some((r) => r.winnerGroup)}
        onClick={() => void perform(false)}
      >
        將成功答案回寫至原 Google Sheets
      </button>
      {operation && (
        <>
          <p aria-live="polite">回寫狀態：{labels[operation.status]}</p>
          {operation.questions.map((q) => (
            <div key={q.questionId}>
              第 {snapshot.questions.find((item) => item.id === q.questionId)?.displayNumber} 題：
              {labels[q.status]}
              {Object.entries(q.itemStatuses).map(([id, status]) => (
                <p key={id}>
                  {snapshot.questions.flatMap((question) => question.items).find((i) => i.id === id)
                    ?.label || '答案'}
                  ：{labels[status]}
                </p>
              ))}
              {q.error && <p>{q.error.message}</p>}
            </div>
          ))}
          {operation.status === 'pending' && (
            <button disabled={!connected || busy} onClick={() => void perform(true)}>
              查核並安全重試
            </button>
          )}
        </>
      )}
      {busy && <p role="status">正在確認回寫狀態…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
