import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { fullGroupName } from '@classroom/shared/formatters/group-name';

export function ProgressTable({ snapshot }: { snapshot: ActivitySnapshot }) {
  const submissions = new Map(
    snapshot.submissions?.map((answer) => [answer.groupId + ':' + answer.questionId, answer]),
  );
  const counts = new Map<string, number>();
  for (const answer of snapshot.submissions ?? [])
    counts.set(answer.groupId, (counts.get(answer.groupId) ?? 0) + 1);
  const results = snapshot.phase === 'ended' ? snapshot.results : snapshot.tentativeResults;
  const winners = new Map(results?.map((result) => [result.questionId, result.winnerGroup?.id]));
  return (
    <div className="progress-section">
      <div className="section-heading">
        <h3>各組作答狀況</h3>
        <span className="muted">完整組名 · 依伺服端受理順序判定</span>
      </div>
      <p className="table-hint">左右捲動可比較所有題目；搶答成功與受理狀態均以文字標示。</p>
      <div
        className="table-frame"
        role="region"
        aria-label="各組作答狀況表格，可橫向捲動"
        tabIndex={0}
      >
        <table
          className="progress-table"
          aria-label="各組作答狀況"
          style={{ minWidth: 424 + snapshot.questions.length * 106 }}
        >
          <thead>
            <tr>
              <th scope="col">組別</th>
              <th scope="col">參與狀態</th>
              <th scope="col">提交總數</th>
              {snapshot.questions.map((question) => (
                <th scope="col" key={question.id}>
                  第 {question.displayNumber} 題
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.groups.map((group) => (
              <tr key={group.id}>
                <th scope="row">{fullGroupName(group)}</th>
                <td>
                  <span className={`badge ${group.occupied ? 'badge-joined' : 'badge-neutral'}`}>
                    {group.occupied ? '已加入' : '尚未加入'}
                  </span>
                </td>
                <td className="submission-count">已提交 {counts.get(group.id) ?? 0} 題</td>
                {snapshot.questions.map((question) => {
                  const accepted = submissions.get(group.id + ':' + question.id);
                  const winner = winners.get(question.id) === group.id;
                  return (
                    <td key={question.id} className={winner ? 'winning-cell' : undefined}>
                      {accepted ? (
                        <>
                          <span className={`badge ${winner ? 'badge-winner' : 'badge-accepted'}`}>
                            {winner ? '搶答成功' : '已受理'}
                          </span>
                          <small className="cell-meta">已受理 · 收件序號 {accepted.sequence}</small>
                        </>
                      ) : (
                        <span className="muted">{group.occupied ? '尚未作答' : '尚未加入'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
