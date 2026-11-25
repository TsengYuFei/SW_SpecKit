import { useEffect, useRef, useState } from 'react';
import {
  writebackSchema,
  type Writeback,
  type WriteStatus,
} from '@classroom/shared/schemas/writeback';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { fullGroupName } from '@classroom/shared/formatters/group-name';
import { http, HttpError } from '../transport/http';
import { newRequestId } from '../transport/request-id';
const labels: Record<WriteStatus, string> = {
  idle: '尚未回填',
  writing: '回填中',
  pending: '待確認',
  verified: '讀回已確認',
  conflict: '來源衝突',
  failed: '回填失敗',
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [local, setLocal] = useState<Writeback | null>(null);
  const pending = useRef<{ kind: 'verify' | 'retry'; requestId: string } | null>(null);
  const remote = snapshot.writebacks?.at(-1),
    operation = local ?? remote;
  const base = '/api/activities/' + snapshot.activityId + '/writeback';
  useEffect(() => {
    setLocal(null);
  }, [remote]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = writebackSchema.parse(await http(base));
        if (active) {
          setLocal(value);
          setError('');
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : '無法確認回填狀態。');
      }
    }
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base]);
  async function perform(kind: 'verify' | 'retry') {
    if (busy) return;
    if (pending.current && pending.current.kind !== kind) {
      setError('上一個復原操作尚未確認，請先以原操作重試。');
      return;
    }
    setBusy(true);
    setError('');
    const request = pending.current ?? { kind, requestId: newRequestId() };
    pending.current = request;
    try {
      setLocal(
        writebackSchema.parse(
          await http(base + '/' + kind, csrfToken, { requestId: request.requestId }),
        ),
      );
      pending.current = null;
    } catch (error) {
      if (error instanceof HttpError) pending.current = null;
      setError(error instanceof Error ? error.message : '回填結果尚未確認，請重新連線查核。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="回寫線上教材">
      <h2>自動回填線上教材</h2>
      <p>搶答結束後由系統自動處理。讀回確認前請暫停在其他視窗編輯此試算表。</p>
      {operation ? (
        <>
          <p aria-live="polite">回填狀態：{labels[operation.status]}</p>
          {operation.questions.map((question) => (
            <div key={question.questionId}>
              第 {snapshot.questions.find((item) => item.id === question.questionId)?.displayNumber}{' '}
              題：{labels[question.status]}
              <p>
                {(() => {
                  const winner = snapshot.results?.find(
                    (result) => result.questionId === question.questionId,
                  )?.winnerGroup;
                  return winner ? fullGroupName(winner) : '無成功組';
                })()}
              </p>
              {question.reasonCode === 'VERIFICATION_PAUSED' && (
                <p>暫時無法確認原表，請檢查連線後查核。</p>
              )}
              {question.reasonCode === 'AUTO_RETRY_EXHAUSTED' && (
                <p>已達自動重試上限，請核對原表後再安全重試。</p>
              )}
              {question.error && <p>{question.error.message}</p>}
            </div>
          ))}
          {operation.questions.some(
            (question) => question.status === 'pending' || question.status === 'failed',
          ) && (
            <>
              <button disabled={!connected || busy} onClick={() => void perform('verify')}>
                查核原表
              </button>
              <button disabled={!connected || busy} onClick={() => void perform('retry')}>
                安全重試回填
              </button>
            </>
          )}
        </>
      ) : (
        <p role="status">正在載入自動回填狀態…</p>
      )}
      {busy && <p role="status">正在查核回填…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
