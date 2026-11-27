import { AnswerOrderPanel } from './AnswerOrderPanel';
import type { ActivityClient } from '../transport/socket';
import { ResultsView } from '../components/ResultsView';
import { WritebackPanel } from './WritebackPanel';
import { ProgressTable } from './ProgressTable';
import { OperationStatus } from '../components/OperationStatus';
import { ExportResultsButton } from './ExportResultsButton';
import type { TeacherScope } from '../transport/download';
import { CopyActivityLinkButton, isStudentLink } from '../components/CopyActivityLinkButton';

export function ActivityPage({
  client,
  studentOrigin,
  csrfToken,
  scope,
}: {
  client: ActivityClient;
  studentOrigin: string;
  csrfToken: string;
  scope: TeacherScope;
}) {
  const s = client.snapshot!;
  const studentUrl = studentOrigin ? `${studentOrigin}/student/${s.activityId}` : '';
  return (
    <section id="activity" aria-label="活動控制" className="activity-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">目前活動</p>
          <h2>活動控制</h2>
        </div>
        <span className={`badge phase-${s.phase}`}>
          {s.phase === 'waiting' ? '等待開始' : s.phase === 'active' ? '搶答進行中' : '搶答已結束'}
        </span>
      </div>
      <div className="join-link">
        <p>
          學生加入連結：
          {isStudentLink(studentUrl, s.activityId) && (
            <a href={studentUrl} target="_blank" rel="noreferrer">
              {studentUrl}
            </a>
          )}
        </p>
        <CopyActivityLinkButton
          studentUrl={studentUrl}
          scope={{ ...scope, activityId: s.activityId }}
        />
      </div>
      <div className="action-row">
        <button
          disabled={!client.connected || client.busy || s.phase !== 'waiting' || !s.sourceReady}
          onClick={() => void client.command('activity:start')}
        >
          開始搶答
        </button>
        <button
          disabled={!client.connected || client.busy || s.phase !== 'active'}
          onClick={() => void client.command('activity:end')}
        >
          結束搶答並自動回填
        </button>
      </div>
      <p className="control-hint">
        {!client.connected
          ? '連線恢復後才能控制活動。'
          : client.busy
            ? '正在保存操作，請稍候。'
            : s.phase === 'waiting'
              ? s.sourceReady
                ? '老師開放後，學生才能看到題目並提交答案。'
                : '請先確認教材，才能開始搶答。'
              : s.phase === 'active'
                ? '活動正在收答，無須再次開始。'
                : '活動已結束，不能重新開始或再次結束。'}
      </p>
      {s.phase === 'active' && (
        <p className="control-hint">
          結束後會自動回填成功答案，請先暫停從其他視窗編輯原試算表；無須再按回填按鈕。
        </p>
      )}
      <div className="activity-metrics">
        <div>
          <strong>
            {s.groups.filter((group) => group.occupied).length}
            <small> / {s.groups.length}</small>
          </strong>
          <span>組已加入</span>
        </div>
        <div>
          <strong>{s.submissions?.length ?? 0}</strong>
          <span>筆答案已保存</span>
        </div>
        <div>
          <strong>{s.questions.length}</strong>
          <span>道教材題目</span>
        </div>
      </div>
      {s.phase === 'active' && !s.submissions?.length && (
        <OperationStatus>尚無答案，等待各組提交完整作答。</OperationStatus>
      )}
      <ProgressTable snapshot={s} />
      <AnswerOrderPanel snapshot={s} />
      {s.phase === 'ended' && (
        <>
          <ResultsView snapshot={s} />
          <WritebackPanel snapshot={s} csrfToken={csrfToken} connected={client.connected} />
        </>
      )}
      <ExportResultsButton
        activityId={s.activityId}
        phase={s.phase}
        csrfToken={csrfToken}
        scope={scope}
      />
    </section>
  );
}
