import { useActivity } from '../transport/socket';
import { ConnectionStatus } from './ConnectionStatus';
import { ActivityPage } from '../teacher/ActivityPage';
import { GroupPage } from '../student/GroupPage';
import { AnswerPage } from '../student/AnswerPage';
import { useEffect } from 'react';
import type { Phase } from '@classroom/shared/schemas/common';
import { ResultsPage } from '../student/ResultsPage';
import type { TeacherScope } from '../transport/download';

export function Classroom({
  activityId,
  bootId,
  role,
  studentOrigin,
  onPhase,
  csrfToken,
  onWritebackPending,
  scope,
}: {
  activityId: string;
  bootId: string;
  role: string;
  studentOrigin: string;
  onPhase?: (phase: Phase) => void;
  csrfToken?: string;
  onWritebackPending?: (pending: boolean) => void;
  scope?: TeacherScope;
}) {
  const client = useActivity(activityId, bootId);
  const phase = client.snapshot?.phase;
  const writebackPending =
    client.snapshot?.writebacks?.some((op) => op.status === 'writing' || op.status === 'pending') ??
    false;
  useEffect(() => {
    onWritebackPending?.(writebackPending);
  }, [writebackPending, onWritebackPending]);
  useEffect(() => {
    if (phase) onPhase?.(phase);
  }, [phase, onPhase]);
  return (
    <>
      <ConnectionStatus connected={client.connected} error={client.error} />
      {client.snapshot &&
        (role === 'teacher' ? (
          <ActivityPage
            client={client}
            studentOrigin={studentOrigin}
            csrfToken={csrfToken ?? ''}
            scope={scope ?? { bootId, sessionVersion: 0, authGeneration: 0 }}
          />
        ) : (
          <>
            <GroupPage client={client} />
            {client.snapshot.self.groupId && <AnswerPage client={client} />}
            {client.snapshot.phase === 'ended' && <ResultsPage snapshot={client.snapshot} />}
          </>
        ))}
    </>
  );
}
