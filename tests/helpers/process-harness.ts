import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { isAbsolute } from 'node:path';

interface Options {
  entryPath: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}
type Message = Record<string, unknown>;
interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export async function startTestProcess(options: Options) {
  if (!isAbsolute(options.entryPath)) throw new Error('測試行程入口必須是絕對路徑');
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec'])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (/GOOGLE_|TOKEN|SECRET|PASSWORD|COOKIE|AUTHORIZATION/i.test(key))
      throw new Error('隔離測試行程不得注入機密設定');
    env[key] = value;
  }
  const child = spawn(process.execPath, [options.entryPath, ...(options.args ?? [])], {
    cwd: options.cwd ?? process.cwd(),
    env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let exited = false;
  const messages: Message[] = [];
  const waiters = new Set<{
    accept: (value: Message) => boolean;
    resolve: (value: Message) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    const value = message as Message;
    for (const waiter of waiters) {
      if (!waiter.accept(value)) continue;
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve(value);
      return;
    }
    if (messages.length < 100) messages.push(value);
  });
  const completion = new Promise<Exit>((resolve) => {
    child.once('close', (code, signal) => {
      exited = true;
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('測試行程已結束，無法取得預期訊息'));
      }
      waiters.clear();
      resolve({ code, signal });
    });
  });
  try {
    await once(child, 'spawn');
  } catch {
    throw new Error('無法啟動隔離測試行程');
  }
  function waitForMessage(accept: (value: Message) => boolean, timeoutMs = 5000) {
    const index = messages.findIndex(accept);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]!);
    if (exited) return Promise.reject(new Error('測試行程已結束，無法取得預期訊息'));
    return new Promise<Message>((resolve, reject) => {
      const waiter = {
        accept,
        resolve,
        reject,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('等待隔離測試行程訊息逾時'));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }
  async function stop() {
    if (exited) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    try {
      await completion;
    } finally {
      clearTimeout(timer);
    }
  }
  return { child, waitForMessage, waitForExit: () => completion, stop };
}
