import { errorCodeSchema } from '@classroom/shared/schemas/common';

const eventNames = ['request_failed', 'server_started', 'server_stopped'];

export function createLogger(write: (line: string) => void = console.info) {
  return (input: Record<string, unknown>) => {
    if (!eventNames.includes(String(input.event))) return;
    const entry: Record<string, unknown> = { event: input.event };
    const code = errorCodeSchema.safeParse(input.code);
    if (code.success) entry.code = code.data;
    if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) {
      entry.durationMs = Math.max(0, input.durationMs);
    }
    write(JSON.stringify(entry));
  };
}
