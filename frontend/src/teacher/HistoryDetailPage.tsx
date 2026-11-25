import { useEffect, useState } from 'react';
import { historyDetailSchema, type HistoryDetail } from '@classroom/shared/schemas/history';
import { fullGroupName } from '@classroom/shared/formatters/group-name';
import { ResultsView } from '../components/ResultsView';
import { WritebackPanel } from './WritebackPanel';
import { http } from '../transport/http';
import { ProgressTable } from './ProgressTable';
import { OperationStatus } from '../components/OperationStatus';
export function HistoryDetailPage({
  activityId,
  csrfToken,
  onBack,
}: {
  activityId: string;
  csrfToken: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDetail(null);
    setError('');
    void http('/api/activities/' + activityId)
      .then((value) => {
        if (active) setDetail(historyDetailSchema.parse(value));
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '無法讀取活動紀錄。');
      });
    return () => {
      active = false;
    };
  }, [activityId]);
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
          <ProgressTable snapshot={detail.snapshot} />
          <h4>組別與已受理答案</h4>
          {detail.snapshot.groups.map((group) => (
            <div key={group.id}>
              <p>
                {fullGroupName(group)}：{group.occupied ? '已加入' : '未加入'}
              </p>
              {detail.snapshot.submissions
                ?.filter((answer) => answer.groupId === group.id)
                .map((answer) => (
                  <div key={answer.id}>
                    第{' '}
                    {
                      detail.snapshot.questions.find(
                        (question) => question.id === answer.questionId,
                      )?.displayNumber
                    }{' '}
                    題，收件序號 {answer.sequence}
                    {Object.entries(answer.answers).map(([id, value]) => (
                      <p key={id}>{value}</p>
                    ))}
                  </div>
                ))}
            </div>
          ))}
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
