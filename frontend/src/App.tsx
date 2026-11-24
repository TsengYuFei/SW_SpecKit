import { useEffect, useState } from 'react';
import { SourcePage } from './teacher/SourcePage';
import { Classroom } from './components/Classroom';
import type { Phase } from '@classroom/shared/schemas/common';

export function App() {
  const [role, setRole] = useState<string>();
  const [error, setError] = useState('');
  const [bootId, setBootId] = useState('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [studentOrigin, setStudentOrigin] = useState('');
  const [phase, setPhase] = useState<Phase>('waiting');
  const [writebackPending, setWritebackPending] = useState(false);
  const [teacher, setTeacher] = useState<{ csrfToken: string; currentActivityId: string | null }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        setRole(result.data.role);
        setBootId(result.data.bootId);
        setStudentOrigin(result.data.studentOrigin ?? '');
        setActivityId(
          result.data.role === 'teacher'
            ? result.data.currentActivityId
            : (window.location.pathname.match(/^\/student\/([^/]+)$/)?.[1] ?? null),
        );
        if (result.data.role === 'teacher') setTeacher(result.data);
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
      {teacher && (
        <SourcePage
          csrfToken={teacher.csrfToken}
          currentActivityId={teacher.currentActivityId}
          onActivity={setActivityId}
          phase={phase}
          writebackPending={writebackPending}
        />
      )}
      {activityId && bootId && (
        <Classroom
          key={activityId}
          activityId={activityId}
          bootId={bootId}
          role={role ?? ''}
          studentOrigin={studentOrigin}
          onPhase={setPhase}
          csrfToken={teacher?.csrfToken}
          onWritebackPending={setWritebackPending}
        />
      )}
    </main>
  );
}
