import { useEffect, useRef, useState } from 'react';
import { SourcePage } from './teacher/SourcePage';
import { Classroom } from './components/Classroom';
import type { Phase } from '@classroom/shared/schemas/common';
import { io } from 'socket.io-client';
import { HistoryPage } from './teacher/HistoryPage';
import { SettingsPage } from './teacher/SettingsPage';

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
  const bootRef = useRef(''),
    sessionCsrfRef = useRef<string | undefined>(undefined);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [teacher, setTeacher] = useState<{
    csrfToken: string;
    currentActivityId: string | null;
    authorized?: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        setRole(result.data.role);
        setBootId(result.data.bootId);
        bootRef.current = result.data.bootId;
        setStudentOrigin(result.data.studentOrigin ?? '');
        setActivityId(
          result.data.role === 'teacher'
            ? result.data.currentActivityId
            : (window.location.pathname.match(/^\/student\/([^/]+)$/)?.[1] ?? null),
        );
        if (result.data.role === 'teacher') {
          setTeacher(result.data);
          sessionCsrfRef.current = result.data.csrfToken;
          authGenerationRef.current = result.data.authGeneration ?? 0;
          setAuthGeneration(authGenerationRef.current);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof TypeError
              ? '無法連線至本機服務，請確認服務已啟動後重新整理。'
              : error instanceof Error
                ? error.message
                : '連線失敗',
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (role !== 'teacher') return;
    const socket = io({ transports: ['websocket'] });
    async function refreshAuthorization(expected?: number) {
      const requestedGeneration = authGenerationRef.current,
        requestedBoot = bootRef.current,
        requestedSession = sessionCsrfRef.current;
      try {
        const response = await fetch('/api/session');
        const result = await response.json();
        if (
          !result.ok ||
          requestedGeneration !== authGenerationRef.current ||
          requestedBoot !== bootRef.current ||
          requestedSession !== sessionCsrfRef.current ||
          (expected !== undefined && authGenerationRef.current !== expected)
        )
          return;
        const generation = result.data.authGeneration ?? 0;
        if (sessionCsrfRef.current !== result.data.csrfToken) {
          sessionCsrfRef.current = result.data.csrfToken;
          setSessionVersion((value) => value + 1);
        }
        bootRef.current = result.data.bootId;
        setBootId(result.data.bootId);
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
    socket.on('connect_error', () => {
      void refreshAuthorization();
    });
    socket.on('teacher:authorization-changed', (value: { authGeneration?: number }) => {
      setActivityId(null);
      setPhase('waiting');
      setWritebackPending(false);
      setTeacher((previous) =>
        previous ? { ...previous, currentActivityId: null, authorized: false } : previous,
      );
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
    <main className={`workspace ${role === 'teacher' ? 'teacher-workspace' : 'student-workspace'}`}>
      <header className="workspace-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            答
          </span>
          <div>
            <p className="eyebrow">GUIDED NOTES</p>
            <h1>課堂搶答</h1>
          </div>
        </div>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status" className="role-label">
            {role === 'teacher' ? '老師控制台' : role === 'student' ? '學生作答頁' : '連線中…'}
          </p>
        )}
      </header>
      {role === 'teacher' && (
        <nav className="workspace-nav" aria-label="老師導覽">
          {activityId && <a href="#activity">目前活動</a>}
          <a href="#source">選擇教材</a>
          {teacher?.authorized && (
            <>
              <a href="#history">歷史活動</a>
              <a href="#settings">老師設定</a>
            </>
          )}
        </nav>
      )}
      {role === 'teacher' && !teacher?.authorized && (
        <p className="welcome-hint">請先連結 Google 帳號，選擇教材或查看自己的歷史活動。</p>
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
      {teacher && (
        <SourcePage
          key={`${bootId}:${sessionVersion}:${authGeneration}:${settingsVersion}`}
          csrfToken={teacher.csrfToken}
          currentActivityId={teacher.currentActivityId}
          onActivity={setActivityId}
          phase={phase}
          writebackPending={writebackPending}
        />
      )}
      {teacher?.authorized && (
        <div
          className="saved-workspace"
          key={`saved-${bootId}-${sessionVersion}-${authGeneration}`}
        >
          <HistoryPage csrfToken={teacher.csrfToken} />
          <SettingsPage
            csrfToken={teacher.csrfToken}
            onSaved={() => setSettingsVersion((value) => value + 1)}
          />
        </div>
      )}
    </main>
  );
}
