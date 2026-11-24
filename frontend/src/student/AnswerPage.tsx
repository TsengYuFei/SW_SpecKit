import { useState } from 'react';
import type { ActivityClient } from '../transport/socket';

export function AnswerPage({ client }: { client: ActivityClient }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const snapshot = client.snapshot!;
  return (
    <section aria-label="作答區">
      <h2>
        {snapshot.phase === 'waiting'
          ? '等待老師開始搶答'
          : snapshot.phase === 'active'
            ? '搶答進行中'
            : '搶答已結束'}
      </h2>
      <p>每個答案為 1–2000 字。題組須填完所有小題，一次送出；每組每題保留第一次有效答案。</p>
      {snapshot.questions.map((q) => {
        const accepted = snapshot.self.receipts.some((r) => r.questionId === q.id);
        const disabled =
          !client.connected || client.busy || snapshot.phase !== 'active' || accepted;
        return (
          <form
            key={q.id}
            aria-label={`第 ${q.displayNumber} 題`}
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
            <button disabled={disabled || q.items.some((item) => !answers[item.id]?.trim())}>
              {accepted ? '本組答案已受理' : '送出完整答案'}
            </button>
          </form>
        );
      })}
    </section>
  );
}
