import { expect, it } from 'vitest';
import { newerSnapshot, sendWithRecovery } from '../../frontend/src/transport/socket.js';
import { projectActivity } from '../../shared/src/projections/activity.js';
import { classroom } from '../helpers/activity.js';

it('handles same-revision updates and rejects older revisions and foreign activity or boot', () => {
  const c = classroom();
  const original = projectActivity(c.activity, c.a);
  const current = { ...original, revision: 5 };
  expect(newerSnapshot(current, original)).toBe(current);
  const same = { ...current, phase: 'active' as const };
  expect(newerSnapshot(current, same)).toBe(same);
  expect(newerSnapshot(current, { ...current, bootId: 'other' })).toBe(current);
  expect(newerSnapshot(current, { ...current, activityId: 'other' })).toBe(current);
});

it('checks own snapshot after a missing acknowledgement then retries the original request ID', async () => {
  const c = classroom();
  const payload = { activityId: c.activity.id, requestId: 'original-id' };
  const calls: { event: string; input: unknown }[] = [];
  let snapshotSeen = false;
  let pendingSeen = false;
  const socket = {
    connected: true,
    timeout: () => ({
      async emitWithAck(event: string, input: unknown) {
        calls.push({ event, input });
        if (calls.length === 1) throw new Error('lost ack');
        return {
          ok: true,
          data:
            event === 'activity:subscribe' ? projectActivity(c.activity, c.a) : { accepted: true },
          revision: 1,
        };
      },
    }),
  };
  expect(
    await sendWithRecovery(
      socket,
      'answer:submit',
      payload,
      () => {
        snapshotSeen = true;
      },
      () => {
        pendingSeen = true;
      },
    ),
  ).toMatchObject({ ok: true });
  expect(calls.map((call) => call.event)).toEqual([
    'answer:submit',
    'activity:subscribe',
    'answer:submit',
  ]);
  expect(calls[2]!.input).toBe(payload);
  expect(snapshotSeen && pendingSeen).toBe(true);
});

it('accepts a new boot only after a fresh session confirms it, then rejects a late old boot', () => {
  const c = classroom(),
    old = projectActivity(c.activity, c.a),
    fresh = { ...old, bootId: 'confirmed-new-boot', revision: 0 };
  expect(newerSnapshot({ ...old, revision: 8 }, fresh, 'confirmed-new-boot')).toBe(fresh);
  expect(newerSnapshot(fresh, old, 'confirmed-new-boot')).toBe(fresh);
});
