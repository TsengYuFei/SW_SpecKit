import type { ReactNode } from 'react';

export function OperationStatus({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'loading' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      className={`operation-status status-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
