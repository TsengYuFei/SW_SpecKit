import { expect, it } from 'vitest';
import { createOAuth } from '../../backend/src/google/oauth.js';
import { createSourceService } from '../../backend/src/activity/source-service.js';
import { createStore } from '../../backend/src/activity/store.js';
import { readConfig } from '../../backend/src/config.js';
import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { deferred } from '../helpers/google-adapter.js';
import { AppError } from '../../backend/src/security/safe-errors.js';

export function fakeGateway(): GoogleGateway {
  return {
    authorizationUrl: (state) => `https://example.invalid/?state=${state}`,
    exchange: async () => ({ access_token: 'invalid-demo-token' }),
    read: async () => [sampleSheet()],
  };
}

it('accepts a state once and binds it to the teacher session', async () => {
  let now = 1000;
  const oauth = createOAuth(fakeGateway(), () => now);
  const url = oauth.begin('teacher');
  const state = new URL(url).searchParams.get('state')!;
  await expect(oauth.finish('other', state, 'code')).rejects.toThrow();
  await oauth.finish('teacher', state, 'code');
  expect(oauth.status('teacher').authorized).toBe(true);
  await expect(oauth.finish('teacher', state, 'code')).rejects.toThrow();
  const nextState = new URL(oauth.begin('teacher')).searchParams.get('state')!;
  now += 300001;
  await expect(oauth.finish('teacher', nextState, 'code')).rejects.toThrow();
});

it('invalidates the prior source on reload and rejects stale confirmation', async () => {
  const gateway = fakeGateway();
  const oauth = createOAuth(gateway);
  await oauth.finish('teacher', new URL(oauth.begin('teacher')).searchParams.get('state')!, 'code');
  const store = createStore(10);
  const activity = store.createActivity(2);
  const source = createSourceService(store, oauth, gateway, readConfig({}));
  const preview = await source.load(activity.id, 'teacher', 'example_sheet');
  source.confirm(activity.id, preview.source!.mappingVersion);
  const delayed = deferred<ReturnType<typeof sampleSheet>[]>();
  gateway.read = () => delayed.promise;
  const loading = source.load(activity.id, 'teacher', 'example_sheet');
  expect(activity.source?.confirmed).toBe(false);
  expect(() => source.confirm(activity.id, preview.source!.mappingVersion)).toThrow();
  delayed.resolve([sampleSheet()]);
  await loading;
  expect(() => source.confirm(activity.id, preview.source!.mappingVersion)).toThrow();
});

it('retains an error state on a failed read and requires authorization', async () => {
  const gateway = fakeGateway();
  const oauth = createOAuth(gateway);
  const store = createStore(10);
  const a = store.createActivity(2);
  const source = createSourceService(store, oauth, gateway, readConfig({}));
  await expect(source.load(a.id, 'unknown', 'example_sheet')).rejects.toThrow();
  await oauth.finish('teacher', new URL(oauth.begin('teacher')).searchParams.get('state')!, 'code');
  gateway.read = async () => {
    throw new Error('synthetic failure');
  };
  await expect(source.load(a.id, 'teacher', 'example_sheet')).rejects.toThrow();
  expect(a.source?.loadState).toBe('error');
});

it('rejects cancellation and ignores an old asynchronous result after the activity changes', async () => {
  const gateway = fakeGateway();
  const oauth = createOAuth(gateway);
  const cancelled = new URL(oauth.begin('teacher')).searchParams.get('state')!;
  await expect(oauth.finish('teacher', cancelled, '')).rejects.toMatchObject({
    code: 'GOOGLE_AUTH_REQUIRED',
  });
  expect(oauth.status('teacher').authorized).toBe(false);
  await oauth.finish('teacher', new URL(oauth.begin('teacher')).searchParams.get('state')!, 'code');
  const store = createStore(10);
  const first = store.createActivity(2);
  const source = createSourceService(store, oauth, gateway, readConfig({}));
  const delayed = deferred<ReturnType<typeof sampleSheet>[]>();
  gateway.read = () => delayed.promise;
  const loading = source.load(first.id, 'teacher', 'example_sheet');
  first.phase = 'ended';
  const second = store.createActivity(2);
  delayed.resolve([sampleSheet()]);
  await expect(loading).rejects.toMatchObject({ code: 'SOURCE_CONFLICT' });
  expect(second.source).toBeNull();
  expect(second.questions).toEqual([]);
  gateway.read = async () => {
    throw new AppError('GOOGLE_FORBIDDEN');
  };
  await expect(source.load(second.id, 'teacher', 'example_sheet')).rejects.toMatchObject({
    code: 'GOOGLE_FORBIDDEN',
  });
});
