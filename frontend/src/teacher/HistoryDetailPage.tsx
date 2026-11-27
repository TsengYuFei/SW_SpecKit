import { useCallback, useEffect, useState } from 'react';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { historyDetailSchema, type HistoryDetail } from '@classroom/shared/schemas/history';
import { HistoryLiveAnswers } from './HistoryLiveAnswers';
import { ResultsView } from '../components/ResultsView';
import { WritebackPanel } from './WritebackPanel';
import { http } from '../transport/http';
import { ProgressTable } from './ProgressTable';
import { OperationStatus } from '../components/OperationStatus';
import { ExportResultsButton } from './ExportResultsButton';
import type { TeacherScope } from '../transport/download';
export function HistoryDetailPage({
  activityId,
  csrfToken,
  onBack,
  scope,
}: {
  activityId: string;
  csrfToken: string;
  onBack: () => void;
  scope: TeacherScope;
}) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null),
    [error, setError] = useState('');
  const updateSnapshot = useCallback((snapshot: ActivitySnapshot) => {
    setDetail((current) =>
      current &&
      current.activityId === snapshot.activityId &&
      current.snapshot.bootId === snapshot.bootId &&
      current.snapshot.authGeneration === snapshot.authGeneration &&
      snapshot.revision >= current.snapshot.revision
        ? { ...current, phase: snapshot.phase, snapshot }
        : current,
    );
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setDetail(null);
    setError('');
    void http('/api/activities/' + activityId, undefined, undefined, { signal: controller.signal })
      .then((value) => {
        if (active) setDetail(historyDetailSchema.parse(value));
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '無法讀取活動紀錄。');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activityId, scope.bootId, scope.sessionVersion, scope.authGeneration]);
  return (
    <section aria-label="歷史活動詳情">
      <h3>活動紀錄</h3>
      <button onClick={onBack}>返回歷史清單</button>
      <a className="inline-link" href="#activity">
        返回目前活動
      </a>
      {error && <OperationStatus kind="error">{error}</OperationStatus>}
      {!detail && !error && <OperationStatus kind="loading">正在讀取已保存活動…</OperationStatus>}
      {detail && (
        <>
          <p>
            教材：{detail.spreadsheetTitle}／{detail.sheetTitle}
          </p>
          <p>
            建立時間：{new Date(detail.createdAt).toLocaleString('zh-TW')}；活動階段：
            {detail.phase === 'waiting'
              ? '等待開始'
              : detail.phase === 'active'
                ? '搶答進行中'
                : '已結束'}
          </p>
          <p>以下為本機保存的教材與答案，查看不會重新讀取或回填Google。</p>
          <ExportResultsButton
            activityId={activityId}
            phase={detail.phase}
            csrfToken={csrfToken}
            scope={scope}
          />
          <ProgressTable snapshot={detail.snapshot} />
          <HistoryLiveAnswers
            key={JSON.stringify([
              activityId,
              scope.bootId,
              scope.sessionVersion,
              scope.authGeneration,
            ])}
            detail={detail}
            scope={scope}
            onDetail={setDetail}
            onSnapshot={updateSnapshot}
          />
          <details>
            <summary>當時題目與填空位置</summary>
            {detail.source?.questions.map((question) => (
              <article key={question.id}>
                <h4>第 {question.displayNumber} 題</h4>
                {question.items.map((item) => (
                  <p key={item.id}>
                    {item.label} {item.prompt}；第 {item.target.rowIndex + 1} 列、第{' '}
                    {item.target.columnIndex + 1} 欄
                  </p>
                ))}
              </article>
            ))}
          </details>
          <ResultsView snapshot={detail.snapshot} />
          {detail.phase === 'ended' && (
            <WritebackPanel snapshot={detail.snapshot} csrfToken={csrfToken} connected={true} />
          )}
        </>
      )}
    </section>
  );
}
