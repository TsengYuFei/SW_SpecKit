import { useId, useMemo, useState } from 'react';
import { deriveAnswerOrder } from '@classroom/shared/projections/answer-order';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { OperationStatus } from '../components/OperationStatus';

export function AnswerOrderPanel({ snapshot }: { snapshot: ActivitySnapshot }) {
  const selectId = useId();
  const [view, setView] = useState<'all' | 'question'>('all');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const order = useMemo(() => {
    try {
      return deriveAnswerOrder(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);
  const question =
    order?.questions.find((q) => q.questionId === selectedQuestionId) ?? order?.questions[0];
  const entries = view === 'all' ? order?.all : question?.entries;
  return (
    <section className="answer-order-panel" aria-label="已受理答案">
      <div className="section-heading">
        <div>
          <p className="eyebrow">收件與順位</p>
          <h3>已受理答案</h3>
        </div>
      </div>
      {!order ? (
        <OperationStatus kind="error">作答紀錄無法完整顯示</OperationStatus>
      ) : (
        <>
          <p className="control-hint">
            全場收件序號是所有題目的受理順序；本題搶答順位只比較同一題，題組完整送出共用一個順位。
          </p>
          <div className="answer-order-controls">
            <div role="group" aria-label="查看收件方式">
              <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
                {view === 'all' && <span aria-hidden="true">✓ </span>}
                全部收件
              </button>
              <button
                type="button"
                aria-pressed={view === 'question'}
                onClick={() => setView('question')}
              >
                {view === 'question' && <span aria-hidden="true">✓ </span>}
                依題目
              </button>
            </div>
            {view === 'question' && (
              <div className="answer-order-select">
                <label htmlFor={selectId}>選擇題目</label>
                <select
                  id={selectId}
                  value={question?.questionId ?? ''}
                  onChange={(event) => setSelectedQuestionId(event.target.value)}
                >
                  {order.questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      第 {q.displayNumber} 題
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {view === 'question' && question && (
            <p>
              本題已受理 {question.entries.length} 組 · 未作答 {question.unansweredGroups.length} 組
            </p>
          )}
          {!entries?.length ? (
            <p>尚無已受理答案。</p>
          ) : (
            <div
              className="answer-order-scroll"
              role="region"
              tabIndex={0}
              aria-label="收件順位表格，可橫向捲動"
            >
              <table className="answer-order-table">
                <caption>
                  {view === 'all' ? '全場收件順序' : `第 ${question?.displayNumber} 題搶答順位`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">全場收件序號</th>
                    <th scope="col">題號</th>
                    <th scope="col">本題搶答順位</th>
                    <th scope="col">組別</th>
                    <th scope="col">子題與答案</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.submissionId}>
                      <td>
                        <span className="receipt-sequence">全場 {entry.globalSequence}</span>
                      </td>
                      <td>
                        第{' '}
                        {
                          order.questions.find((q) => q.questionId === entry.questionId)
                            ?.displayNumber
                        }{' '}
                        題
                      </td>
                      <td>
                        <span className="question-rank">本題第 {entry.questionRank} 名</span>
                      </td>
                      <th scope="row">{entry.fullGroupName}</th>
                      <td>
                        <ul className="receipt-items">
                          {entry.items.map((item) => (
                            <li key={item.itemId}>
                              <p className="receipt-prompt">
                                {item.label && <strong>{item.label} </strong>}
                                {item.prompt}
                              </p>
                              <p className="receipt-answer">{item.answer}</p>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view === 'question' && question && (
            <div className="unanswered-groups">
              <h4>未作答組別</h4>
              {!question.unansweredGroups.length ? (
                <p>本題全部組別皆已作答。</p>
              ) : (
                <ul>
                  {question.unansweredGroups.map((group) => (
                    <li key={group.groupId}>{group.fullGroupName} — 未作答</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
