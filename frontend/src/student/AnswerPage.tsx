import { useState } from 'react';
import type { ActivityClient } from '../transport/socket';
import { OperationStatus } from '../components/OperationStatus';

export function AnswerPage({ client }: { client: ActivityClient }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const snapshot = client.snapshot!;
  return (
    <section aria-label="作答區" className="answer-panel">
      <h2>
        {snapshot.phase === 'waiting'
          ? '等待老師開始搶答'
          : snapshot.phase === 'active'
            ? '搶答進行中'
            : '搶答已結束'}
      </h2>
      {snapshot.phase === 'waiting' ? (
        <OperationStatus>等待老師開放後才會顯示題目。</OperationStatus>
      ) : (
        <p>每個答案為 1–2000 字。題組須填完所有小題，一次送出；每組每題保留第一次有效答案。</p>
      )}
      {(snapshot.phase === 'waiting' ? [] : snapshot.questions).map((q) => {
        const accepted = snapshot.self.receipts.some((r) => r.questionId === q.id);
        const disabled =
          !client.connected || client.busy || snapshot.phase !== 'active' || accepted;
        const incomplete = q.items.some((item) => !answers[item.id]?.trim());
        return (
          <form
            key={q.id}
            aria-label={`第 ${q.displayNumber} 題`}
            className="question-card"
            onSubmit={(e) => {
              e.preventDefault();
              void client.command('answer:submit', {
                questionId: q.id,
                answers: Object.fromEntries(
                  q.items.map((item) => [item.id, answers[item.id] ?? '']),
                ),
              });
            }}
          >
            <h3>
              第 {q.displayNumber} 題{q.kind === 'group' ? '（題組）' : ''}
            </h3>
            {q.items.map((item) => (
              <label key={item.id}>
                {item.label} {item.prompt}
                <textarea
                  required
                  maxLength={2000}
                  disabled={disabled}
                  value={answers[item.id] ?? ''}
                  onChange={(e) =>
                    setAnswers((current) => ({ ...current, [item.id]: e.target.value }))
                  }
                />
              </label>
            ))}
            <p className="control-hint" id={`answer-hint-${q.id}`}>
              {accepted
                ? '本題已保存，保留第一次有效答案。'
                : snapshot.phase === 'ended'
                  ? '活動已結束，無法再送出答案。'
                  : !client.connected
                    ? '連線恢復後才能送出答案。'
                    : client.busy
                      ? '正在保存答案，請稍候…'
                      : incomplete
                        ? '請填完本題所有小題再送出。'
                        : '完整答案已填寫，送出後無法修改。'}
            </p>
            <button aria-describedby={`answer-hint-${q.id}`} disabled={disabled || incomplete}>
              {accepted ? '本組答案已受理' : '送出完整答案'}
            </button>
          </form>
        );
      })}
    </section>
  );
}
