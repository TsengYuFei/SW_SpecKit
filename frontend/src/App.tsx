import { useEffect, useState } from 'react';

export function App() {
  const [role, setRole] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        setRole(result.data.role);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : '連線失敗');
      });
    return () => controller.abort();
  }, []);
  return (
    <main>
      <h1>課堂搶答</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p role="status">
          {role === 'teacher' ? '老師控制台' : role === 'student' ? '學生作答頁' : '連線中…'}
        </p>
      )}
      {role === 'teacher' && <p>服務重啟後，請重新授權並建立活動。</p>}
    </main>
  );
}
