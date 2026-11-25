import { fullGroupName } from '@classroom/shared/formatters/group-name';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';

export function ResultsView({ snapshot }: { snapshot: ActivitySnapshot }) {
  if (snapshot.phase !== 'ended' || !snapshot.results) return null;
  return (
    <section aria-label="公布結果">
      <h2>公布結果</h2>
      {snapshot.results.map((result) => (
        <article key={result.questionId} aria-label={`第 ${result.displayNumber} 題結果`}>
          <h3>第 {result.displayNumber} 題</h3>
          <p>
            {result.winnerGroup ? `搶答成功：${fullGroupName(result.winnerGroup)}` : '無成功組'}
          </p>
          {snapshot.questions
            .find((q) => q.id === result.questionId)
            ?.items.map((item) => (
              <p key={item.id}>
                {item.label} {item.prompt}：{result.answers[item.id] ?? '未作答'}
              </p>
            ))}
        </article>
      ))}
    </section>
  );
}
