import { useState } from 'react';
import { groupNameSchema } from '@classroom/shared/schemas/activity';
import { fullGroupName } from '@classroom/shared/formatters/group-name';
import type { ActivityClient } from '../transport/socket';
import { OperationStatus } from '../components/OperationStatus';
export function GroupPage({ client }: { client: ActivityClient }) {
  const [name, setName] = useState(''),
    [error, setError] = useState('');
  const snapshot = client.snapshot!,
    own = snapshot.groups.find((group) => group.id === snapshot.self.groupId);
  return (
    <section aria-label="組別選擇" className="group-panel">
      <h2>{own ? fullGroupName(own) : '選擇組別'}</h2>
      {own ? (
        <p>組名已確認，無法更改。重新整理仍使用同一組。</p>
      ) : (
        <>
          <p>
            每組僅限一個瀏覽器身分。請填寫組名，再點選空組完成加入；送出後無法改名。清除 Cookie
            或換瀏覽器將無法接管原組。
          </p>
          <label>
            組別名稱（1–40 字）
            <input
              required
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="control-hint">已占用的組別無法加入；請使用同一個瀏覽器回到原組。</p>
          {snapshot.phase === 'ended' && (
            <OperationStatus kind="warning">活動已結束，無法再加入組別。</OperationStatus>
          )}
          <div className="group-options">
            {snapshot.groups.map((group) => (
              <button
                key={group.id}
                disabled={
                  !client.connected || client.busy || group.occupied || snapshot.phase === 'ended'
                }
                onClick={() => {
                  const parsed = groupNameSchema.safeParse(name);
                  if (!parsed.success) {
                    setError('請填寫 1–40 字的組名，不能只有空白。');
                    return;
                  }
                  setError('');
                  void client.command('group:join', { groupId: group.id, name: parsed.data });
                }}
              >
                {fullGroupName(group)}
                {group.occupied ? '（已占用）' : ''}
              </button>
            ))}
          </div>
          {client.busy && <OperationStatus kind="loading">正在確認組別，請稍候…</OperationStatus>}
          {error && <OperationStatus kind="error">{error}</OperationStatus>}
        </>
      )}
    </section>
  );
}
