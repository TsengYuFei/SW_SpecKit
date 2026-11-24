import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createListener } from '../../backend/src/server.js';
import { createStore } from '../../backend/src/activity/store.js';
import { createSessions } from '../../backend/src/security/sessions.js';
import { readConfig } from '../../backend/src/config.js';
import { close, listen } from '../helpers/server.js';

const cleanup: (() => Promise<void>)[] = [];
const clients: Socket[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const stop of cleanup.splice(0)) await stop();
});

async function start() {
  const listener = createListener('student', createStore(2), createSessions(), readConfig({}));
  cleanup.push(async () => {
    listener.io.disconnectSockets(true);
    await close(listener.server);
  });
  const url = await listen(listener.server);
  const response = await fetch(`${url}/api/session`);
  return { url, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function connect(url: string, origin: string, cookie: string) {
  const client = io(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: origin, Cookie: cookie },
  });
  clients.push(client);
  return new Promise<boolean>((resolve) => {
    client.once('connect', () => resolve(true));
    client.once('connect_error', () => resolve(false));
  });
}

it('accepts only the correct origin and server-issued cookie', async () => {
  const { url, cookie } = await start();
  expect(await connect(url, url, cookie)).toBe(true);
  expect(await connect(url, 'http://evil.invalid', cookie)).toBe(false);
  expect(await connect(url, url, 'student_session=forged')).toBe(false);
});
