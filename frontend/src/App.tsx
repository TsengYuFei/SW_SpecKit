import { useEffect, useRef, useState } from 'react';
import { SourcePage } from './teacher/SourcePage';
import { Classroom } from './components/Classroom';
import type { Phase } from '@classroom/shared/schemas/common';
import { io } from 'socket.io-client';

export function App() {
  const [role, setRole] = useState<string>();
  const [error, setError] = useState('');
  const [bootId, setBootId] = useState('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [studentOrigin, setStudentOrigin] = useState('');
  const [phase, setPhase] = useState<Phase>('waiting');
  const [writebackPending, setWritebackPending] = useState(false);
  const [authGeneration, setAuthGeneration] = useState(0);
  const authGenerationRef = useRef(0);
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
        if (result.data.role === 'teacher') {
          setTeacher(result.data);
          authGenerationRef.current = result.data.authGeneration ?? 0;
          setAuthGeneration(authGenerationRef.current);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : '連線失敗');
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (role !== 'teacher') return;
    const socket = io({ transports: ['websocket'] });
    async function refreshAuthorization(expected?: number) {
      try {
        const response = await fetch('/api/session');
        const result = await response.json();
        if (!result.ok || (expected !== undefined && authGenerationRef.current !== expected))
          return;
        const generation = result.data.authGeneration ?? 0;
        if (expected === undefined && generation === authGenerationRef.current) return;
        authGenerationRef.current = generation;
        setAuthGeneration(generation);
        setTeacher(result.data);
        setActivityId(result.data.currentActivityId);
      } catch {
        /* The source page displays actionable network errors on its next request. */
      }
    }
    socket.on('connect', () => {
      void refreshAuthorization();
    });
    socket.on('teacher:authorization-changed', (value: { authGeneration?: number }) => {
      setActivityId(null);
      setPhase('waiting');
      setWritebackPending(false);
      setTeacher((previous) => (previous ? { ...previous, currentActivityId: null } : previous));
      const generation = value.authGeneration ?? authGenerationRef.current + 1;
      authGenerationRef.current = generation;
      setAuthGeneration(generation);
      void refreshAuthorization(generation);
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') socket.connect();
    });
    return () => {
      socket.disconnect();
    };
  }, [role]);
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
      {role === 'teacher' && <p>請授權原建立帳號以存取自己的教材與活動。</p>}
      {teacher && (
        <SourcePage
          key={authGeneration}
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
