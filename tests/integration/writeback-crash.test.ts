import { expect, it } from 'vitest';
import { workerFixture } from '../helpers/worker.js';
import { AppError } from '../../backend/src/security/safe-errors.js';

it('persists the three-write budget and 2/4 second delays without retrying early', async () => {
  const c = workerFixture();
  let writes = 0;
  c.gateway.write = async () => {
    writes++;
    throw new AppError('NETWORK_ERROR');
  };
  try {
    await c.worker.tick();
    expect(c.row()).toMatchObject({
      write_attempt_count: 1,
      status: 'pending',
      next_attempt_at: 12000,
    });
    c.advance(1999);
    await c.worker.tick();
    expect(writes).toBe(1);
    c.advance(1);
    await c.worker.tick();
    expect(c.row()).toMatchObject({ write_attempt_count: 2, next_attempt_at: 16000 });
    await c.restart();
    c.advance(3999);
    await c.worker.tick();
    expect(writes).toBe(2);
    c.advance(1);
    await c.worker.tick();
    expect(c.row()).toMatchObject({
      write_attempt_count: 3,
      status: 'failed',
      safe_error_code: 'AUTO_RETRY_EXHAUSTED',
    });
    expect(writes).toBe(3);
  } finally {
    await c.close();
  }
});
it('pauses after four logical read failures, preserves the budget on restart and keeps explicit verify read-only', async () => {
  const c = workerFixture();
  const read = c.gateway.readSheetById!;
  c.gateway.readSheetById = async () => {
    throw new AppError('NETWORK_ERROR');
  };
  try {
    for (const delay of [0, 1000, 2000, 4000]) {
      c.advance(delay);
      await c.worker.tick();
    }
    expect(c.row()).toMatchObject({
      status: 'pending',
      verification_failure_count: 4,
      write_attempt_count: 0,
      safe_error_code: 'VERIFICATION_PAUSED',
      next_attempt_at: null,
    });
    await c.restart();
    c.worker.wakeOwner('test-owner-a');
    await c.worker.tick();
    expect(c.row().verification_failure_count).toBe(4);
    c.gateway.readSheetById = read;
    await c.worker.verify(c.jobId());
    expect(c.row()).toMatchObject({
      status: 'pending',
      verification_failure_count: 0,
      write_attempt_count: 0,
      next_attempt_at: null,
    });
    expect(c.writes).toEqual([]);
  } finally {
    await c.close();
  }
});
it('does not consume read/write budget while waiting for the original owner', async () => {
  const c = workerFixture();
  try {
    c.authorized = false;
    await c.worker.tick();
    expect(c.row()).toMatchObject({
      safe_error_code: 'GOOGLE_AUTH_REQUIRED',
      write_attempt_count: 0,
      verification_failure_count: 0,
      next_attempt_at: null,
    });
    c.authorized = true;
    c.worker.wakeOwner('test-owner-a');
    await c.worker.tick();
    expect(c.row().status).toBe('verified');
    expect(c.writes).toHaveLength(1);
  } finally {
    await c.close();
  }
});
it('stops dispatch when precheck progress cannot be saved and never sends the write', async () => {
  const c = workerFixture();
  const read = c.gateway.readSheetById!;
  c.gateway.readSheetById = async (...args) => {
    const value = await read(...args);
    c.p.connection.database.exec('PRAGMA query_only=ON');
    return value;
  };
  try {
    await expect(c.worker.drain()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(c.worker.halted).toBe(true);
    expect(c.writes).toEqual([]);
    c.p.connection.database.exec('PRAGMA query_only=OFF');
    c.worker.wake();
    expect(c.writes).toEqual([]);
  } finally {
    c.p.connection.database.exec('PRAGMA query_only=OFF');
    await c.close();
  }
});
it('classifies a mixed answer group as conflict and does not send a partial write', async () => {
  const c = workerFixture();
  try {
    c.grid.rows[1]![4] = { userEnteredValue: { stringValue: '=SUM(A1)' } };
    await c.worker.tick();
    expect(c.row().status).toBe('conflict');
    expect(c.writes).toEqual([]);
  } finally {
    await c.close();
  }
});
it('verifies an already-applied unknown write without writing it a second time', async () => {
  const c = workerFixture();
  const write = c.gateway.write;
  c.gateway.write = async (...args) => {
    await write(...args);
    throw new AppError('NETWORK_ERROR');
  };
  try {
    await c.worker.tick();
    expect(c.row().status).toBe('verified');
    expect(c.writes).toHaveLength(1);
  } finally {
    await c.close();
  }
});

it('keeps an unknown third write pending through read-budget exhaustion and verifies later without a fourth write', async () => {
  const c = workerFixture();
  let writes = 0;
  const read = c.gateway.readSheetById!;
  c.gateway.write = async () => {
    writes++;
    if (writes === 3)
      c.gateway.readSheetById = async () => {
        throw new AppError('NETWORK_ERROR');
      };
    throw new AppError('NETWORK_ERROR');
  };
  try {
    await c.worker.tick();
    c.advance(2000);
    await c.worker.tick();
    c.advance(4000);
    await c.worker.tick();
    for (const delay of [1000, 2000, 4000]) {
      c.advance(delay);
      await c.worker.tick();
    }
    expect(c.row()).toMatchObject({
      status: 'pending',
      write_attempt_count: 3,
      verification_failure_count: 4,
      safe_error_code: 'VERIFICATION_PAUSED',
      next_attempt_at: null,
    });
    c.gateway.readSheetById = read;
    c.grid.rows[1]![4] = { userEnteredValue: { stringValue: '=SUM(A1)' } };
    c.grid.rows[2]![4] = { userEnteredValue: { stringValue: '安全答案' } };
    await c.worker.verify(c.jobId());
    expect(c.row().status).toBe('verified');
    expect(writes).toBe(3);
  } finally {
    await c.close();
  }
});

it.each(['end-committed', 'write-committed', 'write-sent', 'readback-complete'] as const)(
  'recovers a real killed child at %s using the actual transaction and worker',
  async (checkpoint) => {
    const { buildSync } = await import('esbuild');
    const { writeFileSync, readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const { startTestProcess } = await import('../helpers/process-harness.js');
    const c = workerFixture({ active: true }),
      entryPath = join(c.p.directory, 'writeback-child.mjs'),
      cloudPath = join(c.p.directory, 'synthetic-cloud.json');
    writeFileSync(cloudPath, JSON.stringify(c.grid));
    const source = `
 import {readFileSync,writeFileSync} from 'node:fs';
 import {openDatabase} from './backend/src/persistence/connection.ts';
 import {createRepositories} from './backend/src/persistence/repositories.ts';
 import {createStore} from './backend/src/activity/store.ts';
 import {readPersistentActivity} from './backend/src/activity/persistent-store.ts';
 import {createPersistentCommands} from './backend/src/activity/persistent-commands.ts';
 import {createWritebackWorker} from './backend/src/google/writeback-worker.ts';
 import {randomUUID} from 'node:crypto';
 const connection=openDatabase(process.env.DATABASE_PATH),p={connection,...createRepositories(connection)};
 const store=createStore(100),id=process.env.ACTIVITY_ID;
 store.installActivity(readPersistentActivity(p,store,id));
 const command=createPersistentCommands(store,p,()=>({accountId:'test-owner-a'}));
 command({role:'teacher',sessionId:'synthetic-session',activityId:null,csrfToken:'invalid-demo-value',windowStart:0,mutationCount:0},'activity:end',{activityId:id,requestId:randomUUID()});
 process.on('message',()=>{});
 async function pause(point){if(point===process.env.CHECKPOINT){process.send({kind:'checkpoint',point});await new Promise(()=>{});}}
 await pause('end-committed');
 const gateway={readSheetById:async()=>JSON.parse(readFileSync(process.env.CLOUD_PATH,'utf8')),write:async(_id,_auth,updates)=>{const grid=JSON.parse(readFileSync(process.env.CLOUD_PATH,'utf8'));for(const {target,answer} of updates){grid.rows[target.rowIndex]??=[];grid.rows[target.rowIndex][target.columnIndex]={userEnteredValue:{stringValue:answer}};}writeFileSync(process.env.CLOUD_PATH,JSON.stringify(grid));}};
 const worker=createWritebackWorker(p,gateway,()=>({credentials:{},valid:()=>true}),{automatic:false,checkpoint:pause});
 await worker.tick();
 `;
    buildSync({
      stdin: {
        contents: source,
        resolveDir: process.cwd(),
        sourcefile: 'synthetic-writeback-child.ts',
      },
      outfile: entryPath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      tsconfig: resolve('tsconfig.json'),
      logLevel: 'silent',
    });
    const child = await startTestProcess({
      entryPath,
      env: {
        DATABASE_PATH: c.p.databasePath,
        ACTIVITY_ID: c.activity.id,
        CLOUD_PATH: cloudPath,
        CHECKPOINT: checkpoint,
      },
    });
    try {
      await child.waitForMessage((value) => value.kind === 'checkpoint');
      child.child.kill('SIGKILL');
      await child.waitForExit();
      expect(c.p.writebacks.getForActivity(c.activity.id)).toBeTruthy();
      expect(
        c.p.connection.database
          .prepare('SELECT * FROM command_receipts WHERE event=?')
          .all('activity:end'),
      ).toHaveLength(1);
      c.grid = JSON.parse(readFileSync(cloudPath, 'utf8'));
      c.advance(Date.now() - 10000 + 10);
      await c.restart();
      if (checkpoint !== 'end-committed') expect(c.row().write_attempt_count).toBe(1);
      await c.worker.tick();
      c.advance(4000);
      await c.worker.tick();
      expect(c.row().status).toBe('verified');
      expect(c.writes).toHaveLength(
        ['write-sent', 'readback-complete'].includes(checkpoint) ? 0 : 1,
      );
      expect(c.p.connection.database.prepare('SELECT * FROM writeback_jobs').all()).toHaveLength(1);
    } finally {
      await child.stop();
      await c.close();
    }
  },
  15000,
);

it('pauses on a rejected existing grant instead of spinning indefinitely on Google 401', async () => {
  const c = workerFixture();
  let reads = 0;
  c.gateway.readSheetById = async () => {
    reads++;
    throw new AppError('GOOGLE_AUTH_REQUIRED');
  };
  try {
    await c.worker.tick();
    expect(reads).toBe(1);
    expect(c.row()).toMatchObject({
      status: 'pending',
      safe_error_code: 'GOOGLE_AUTH_REQUIRED',
      next_attempt_at: null,
      write_attempt_count: 0,
      verification_failure_count: 0,
    });
  } finally {
    await c.close();
  }
});
