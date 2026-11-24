import type { ActivityClient } from '../transport/socket';
import { ResultsView } from '../components/ResultsView';
import { WritebackPanel } from './WritebackPanel';

export function ActivityPage({
  client,
  studentOrigin,
  csrfToken,
}: {
  client: ActivityClient;
  studentOrigin: string;
  csrfToken: string;
}) {
  const s = client.snapshot!;
  return (
    <section aria-label="活動控制">
      <h2>活動控制</h2>
      <p>
        學生加入連結：
        <a href={`${studentOrigin}/student/${s.activityId}`} target="_blank" rel="noreferrer">
          {studentOrigin}/student/{s.activityId}
        </a>
      </p>
      <p>
        階段：
        {s.phase === 'waiting' ? '等待開始' : s.phase === 'active' ? '搶答進行中' : '搶答已結束'}
      </p>
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
        結束搶答
      </button>
      <h3>各組作答狀況</h3>
      {s.groups.map((g) => (
        <p key={g.id}>
          第 {g.ordinal} 組{g.name ? `－${g.name}` : ''}：{g.occupied ? '已加入' : '未加入'}，已提交{' '}
          {s.submissions?.filter((item) => item.groupId === g.id).length ?? 0} 題
        </p>
      ))}
      <h3>暫定搶答成功組</h3>
      {s.tentativeResults?.map((r) => (
        <div key={r.questionId}>
          第 {r.displayNumber} 題：
          {r.winnerGroup
            ? `第 ${r.winnerGroup.ordinal} 組${r.winnerGroup.name ? `－${r.winnerGroup.name}` : ''}`
            : '尚無成功組'}
          {Object.entries(r.answers).map(([id, answer]) => (
            <p key={id}>{answer}</p>
          ))}
        </div>
      ))}
      <details>
        <summary>全組已受理答案</summary>
        {s.submissions?.map((item) => (
          <div key={item.id}>
            第 {s.groups.find((g) => g.id === item.groupId)?.ordinal} 組，題目{' '}
            {s.questions.find((q) => q.id === item.questionId)?.displayNumber}，收件序號{' '}
            {item.sequence}
            {Object.entries(item.answers).map(([id, value]) => (
              <p key={id}>{value}</p>
            ))}
          </div>
        ))}
      </details>
      {s.phase === 'ended' && (
        <>
          <ResultsView snapshot={s} />
          <WritebackPanel snapshot={s} csrfToken={csrfToken} connected={client.connected} />
        </>
      )}
    </section>
  );
}
