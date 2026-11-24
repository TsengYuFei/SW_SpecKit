export function ConnectionStatus({ connected, error }: { connected: boolean; error: string }) {
  return (
    <>
      {<p aria-live="polite">{connected ? '即時連線已建立' : '連線中斷，等待重新連線…'}</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
