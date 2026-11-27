import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { historyDetailSchema, type HistoryDetail } from '@classroom/shared/schemas/history';
import { useActivity } from '../transport/socket';
import type { TeacherScope } from '../transport/download';
import { http } from '../transport/http';
import { AnswerOrderPanel } from './AnswerOrderPanel';
import { OperationStatus } from '../components/OperationStatus';

function HistorySubscription({
  activityId,
  scope,
  onSnapshot,
  onTerminal,
}: {
  activityId: string;
  scope: TeacherScope;
  onSnapshot: (value: ActivitySnapshot) => void;
  onTerminal: (value?: ActivitySnapshot) => void;
}) {
  const client = useActivity(activityId, scope.bootId);
  useEffect(() => {
    const value = client.snapshot;
    if (!value || value.bootId !== scope.bootId || value.authGeneration !== scope.authGeneration)
      return;
    onSnapshot(value);
    if (value.phase === 'ended') onTerminal(value);
  }, [client.snapshot, scope.bootId, scope.authGeneration, onSnapshot, onTerminal]);
  useEffect(() => {
    if (client.errorCode === 'ACTIVITY_UNAVAILABLE') onTerminal();
  }, [client.errorCode, onTerminal]);
  return client.error && client.errorCode !== 'ACTIVITY_UNAVAILABLE' ? (
    <OperationStatus kind="warning">{client.error}</OperationStatus>
  ) : null;
}

export function HistoryLiveAnswers({
  detail,
  scope,
  onDetail,
  onSnapshot,
}: {
  detail: HistoryDetail;
  scope: TeacherScope;
  onDetail: (value: HistoryDetail) => void;
  onSnapshot: (value: ActivitySnapshot) => void;
}) {
  const key = JSON.stringify([
    detail.activityId,
    scope.bootId,
    scope.sessionVersion,
    scope.authGeneration,
  ]);
  const fence = useRef(key);
  fence.current = key;
  const alive = useRef(true),
    terminal = useRef(false),
    controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<'live' | 'refreshing' | 'saved'>(
    detail.phase === 'ended' ? 'saved' : 'live',
  );
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>(detail.snapshot);
  const [error, setError] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const receive = useCallback(
    (value: ActivitySnapshot) => {
      if (alive.current) {
        setSnapshot(value);
        onSnapshot(value);
      }
    },
    [onSnapshot],
  );
  const refreshOnce = useCallback(
    (latest?: ActivitySnapshot) => {
      if (terminal.current || !alive.current || fence.current !== key) return;
      terminal.current = true;
      if (latest) setSnapshot(latest);
      setState('refreshing');
      const abort = new AbortController();
      controller.current = abort;
      const valid = () => alive.current && !abort.signal.aborted && fence.current === key;
      void http('/api/activities/' + detail.activityId, undefined, undefined, {
        signal: abort.signal,
      })
        .then((value) => {
          if (!valid()) return;
          const saved = historyDetailSchema.parse(value);
          if (
            saved.snapshot.bootId !== scope.bootId ||
            saved.snapshot.authGeneration !== scope.authGeneration
          )
            return;
          setSnapshot(saved.snapshot);
          onDetail(saved);
        })
        .catch(() => {
          if (valid()) setError('歷史資料暫時無法更新，以下保留本次已取得的作答紀錄。');
        })
        .finally(() => {
          if (valid()) setState('saved');
        });
    },
    [key, detail.activityId, scope.bootId, scope.authGeneration, onDetail],
  );
  return (
    <>
      {state === 'live' && (
        <HistorySubscription
          activityId={detail.activityId}
          scope={scope}
          onSnapshot={receive}
          onTerminal={refreshOnce}
        />
      )}
      <AnswerOrderPanel snapshot={snapshot} />
      {state === 'refreshing' && (
        <OperationStatus kind="loading">正在同步已保存的歷史活動…</OperationStatus>
      )}
      {error && <OperationStatus kind="warning">{error}</OperationStatus>}
    </>
  );
}
