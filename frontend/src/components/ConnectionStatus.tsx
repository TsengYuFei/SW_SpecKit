import { OperationStatus } from './OperationStatus';
export function ConnectionStatus({ connected, error }: { connected: boolean; error: string }) {
  return (
    <>
      <p className={`connection-label ${connected ? 'is-connected' : ''}`} aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        {connected ? '即時連線已建立' : '連線中斷，等待重新連線…'}
      </p>
      {error && <OperationStatus kind="error">{error}</OperationStatus>}
    </>
  );
}
