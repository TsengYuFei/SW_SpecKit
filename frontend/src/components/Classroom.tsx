import { useActivity } from '../transport/socket';
import { ConnectionStatus } from './ConnectionStatus';
import { ActivityPage } from '../teacher/ActivityPage';
import { GroupPage } from '../student/GroupPage';
import { AnswerPage } from '../student/AnswerPage';
import { useEffect } from 'react';
import type { Phase } from '@classroom/shared/schemas/common';

export function Classroom({
  activityId,
  bootId,
  role,
  studentOrigin,
  onPhase,
}: {
  activityId: string;
  bootId: string;
  role: string;
  studentOrigin: string;
  onPhase?: (phase: Phase) => void;
}) {
  const client = useActivity(activityId, bootId);
  const phase = client.snapshot?.phase;
  useEffect(() => {
    if (phase) onPhase?.(phase);
  }, [phase, onPhase]);
  return (
    <>
      <ConnectionStatus connected={client.connected} error={client.error} />
      {client.snapshot &&
        (role === 'teacher' ? (
          <ActivityPage client={client} studentOrigin={studentOrigin} />
        ) : (
          <>
            <GroupPage client={client} />
            {client.snapshot.self.groupId && <AnswerPage client={client} />}
          </>
        ))}
    </>
  );
}
