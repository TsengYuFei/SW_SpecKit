import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Envelope } from '@classroom/shared/events/envelope';
import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { newRequestId } from './request-id';

interface AckSocket {
  connected: boolean;
  timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<unknown> };
}
export async function sendWithRecovery(
  socket: AckSocket,
  event: string,
  payload: { activityId: string; requestId: string },
  onSnapshot: (snapshot: ActivitySnapshot) => void,
  onPending: () => void,
): Promise<Envelope<unknown>> {
  try {
    return (await socket.timeout(3000).emitWithAck(event, payload)) as Envelope<unknown>;
  } catch {
    onPending();
    if (!socket.connected) throw new Error('操作尚未確認，請重新連線後檢查自組受理狀態。');
    const state = (await socket.timeout(3000).emitWithAck('activity:subscribe', {
      activityId: payload.activityId,
      requestId: newRequestId(),
    })) as Envelope<ActivitySnapshot>;
    if (!state.ok) throw new Error(state.error.message);
    onSnapshot(state.data);
    return (await socket.timeout(3000).emitWithAck(event, payload)) as Envelope<unknown>;
  }
}

export function newerSnapshot(current: ActivitySnapshot | null, incoming: ActivitySnapshot) {
  if (
    current &&
    (incoming.activityId !== current.activityId ||
      incoming.bootId !== current.bootId ||
      incoming.revision < current.revision)
  )
    return current;
  return incoming;
}
export function useActivity(activityId: string, bootId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activeCommand = useRef(false);
  const pending = useRef<{
    event: string;
    fingerprint: string;
    payload: { activityId: string; requestId: string };
  } | null>(null);
  useEffect(() => {
    setSnapshot(null);
    const socket = io({ autoConnect: false, transports: ['websocket'] });
    socketRef.current = socket;
    function apply(value: ActivitySnapshot) {
      if (value.activityId !== activityId || value.bootId !== bootId) {
        setError('服務已重啟或活動已更換，請使用老師提供的新活動連結。');
        return;
      }
      setSnapshot((current) => newerSnapshot(current, value));
    }
    async function subscribe() {
      try {
        const response = (await socket.timeout(3000).emitWithAck('activity:subscribe', {
          activityId,
          requestId: newRequestId(),
        })) as Envelope<ActivitySnapshot>;
        if (!response.ok) throw new Error(response.error.message);
        apply(response.data);
        setError('');
        if (pending.current && !activeCommand.current) {
          const prior = pending.current;
          const receipt = (await socket
            .timeout(3000)
            .emitWithAck(prior.event, prior.payload)) as Envelope<unknown>;
          pending.current = null;
          if (!receipt.ok) setError(receipt.error.message);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : '活動狀態尚未確認，請重新連線。');
      }
    }
    socket.on('connect', () => {
      setConnected(true);
      void subscribe();
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setError('連線中斷，請檢查網路；服務重啟後須使用新活動連結。');
    });
    socket.on('activity:snapshot', apply);
    socket.connect();
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activityId, bootId]);
  const command = useCallback(
    async (event: string, extra: Record<string, unknown> = {}) => {
      if (activeCommand.current) return false;
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError('連線中斷，請連線後重試。');
        return false;
      }
      const fingerprint = JSON.stringify(extra);
      if (
        pending.current &&
        (pending.current.event !== event || pending.current.fingerprint !== fingerprint)
      ) {
        setError('上一個操作尚未確認，請重新連線查核，或以原內容重試。');
        return false;
      }
      const payload = pending.current?.payload ?? {
        activityId,
        requestId: newRequestId(),
        ...extra,
      };
      pending.current = { event, fingerprint, payload };
      activeCommand.current = true;
      setBusy(true);
      setError('');
      try {
        const response = await sendWithRecovery(
          socket,
          event,
          payload,
          (state) => setSnapshot((current) => newerSnapshot(current, state)),
          () => setError('操作尚未確認，正在查詢自組狀態並使用原請求編號重試…'),
        );
        pending.current = null;
        if (!response.ok) throw new Error(response.error.message);
        setError('');
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : '操作尚未確認，請重新連線查詢。');
        return false;
      } finally {
        activeCommand.current = false;
        setBusy(false);
      }
    },
    [activityId],
  );
  return { snapshot, connected, error, busy, command };
}
export type ActivityClient = ReturnType<typeof useActivity>;
