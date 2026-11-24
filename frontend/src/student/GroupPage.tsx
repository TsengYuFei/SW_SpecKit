import { useState } from 'react';
import type { ActivityClient } from '../transport/socket';

export function GroupPage({ client }: { client: ActivityClient }) {
  const [name, setName] = useState('');
  const snapshot = client.snapshot!;
  const own = snapshot.groups.find((g) => g.id === snapshot.self.groupId);
  return (
    <section aria-label="組別選擇">
      <h2>{own ? `第 ${own.ordinal} 組${own.name ? `－${own.name}` : ''}` : '選擇組別'}</h2>
      {!own && (
        <>
          <p>每組僅限一個瀏覽器身分。清除 Cookie 或換瀏覽器將無法接管已占用的組別。</p>
          {snapshot.groups.map((g) => (
            <button
              key={g.id}
              disabled={
                !client.connected || client.busy || g.occupied || snapshot.phase === 'ended'
              }
              onClick={() => void client.command('group:join', { groupId: g.id })}
            >
              第 {g.ordinal} 組{g.name ? `－${g.name}` : ''}
              {g.occupied ? '（已占用）' : ''}
            </button>
          ))}
        </>
      )}
      {own && snapshot.phase !== 'ended' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void client.command('group:rename', { name });
          }}
        >
          <label>
            組別名稱（1–40 字）
            <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button disabled={!client.connected || client.busy}>儲存組名</button>
        </form>
      )}
    </section>
  );
}
