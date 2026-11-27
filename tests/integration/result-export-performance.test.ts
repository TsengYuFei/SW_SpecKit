import { expect, it } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
import { createResultExportService } from '../../backend/src/activity/result-export-service.js';
import { createExportGate } from '../../backend/src/export/export-gate.js';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { deferred } from '../helpers/google-adapter.js';
it('downloads every value for 30 groups/20 questions/40 rows within five seconds and releases cancelled slots', async () => {
  const c = await resultExportFixture({ kind: 'performance' });
  try {
    const id = c.histories[0]!,
      start = performance.now();
    const response = await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
      headers: c.client.headers,
    });
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
    const elapsed = performance.now() - start;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThanOrEqual(5000);
    expect(body).toContain('合成答案30-20-2');
    expect(body.split('\r\n')).toHaveLength(42);
    const session = c.server.sessions.find(c.client.cookie, 'teacher')!.sessionId;
    const service = createResultExportService(
      c.server.persistence,
      c.server.oauth,
      createExportGate(),
    );
    await expect(service.download(session, id, AbortSignal.abort())).rejects.toMatchObject({
      code: 'EXPORT_BUSY',
    });
    expect((await service.download(session, id)).bytes.length).toBeGreaterThan(1000);
    console.info(
      JSON.stringify({
        scenario: 'synthetic-result-export',
        elapsedMs: Math.round(elapsed),
        dataRows: 40,
        groups: 30,
        questions: 20,
      }),
    );
  } finally {
    await c.close();
  }
});

it('serves a bounded export alongside another owner’s live Socket.IO answers and isolates session limits', async () => {
  const c = await resultExportFixture({ kind: 'performance' });
  const sockets: Socket[] = [];
  try {
    const b = await c.server.client('owner-b');
    const preview = (
      await (await b.post('/api/source-previews', { spreadsheetId: 'source-one' })).json()
    ).data;
    const created = await b.post('/api/activities', {
      requestId: randomUUID(),
      previewId: preview.previewId,
      groupCount: 2,
    });
    expect(created.status).toBe(200);
    const activity = c.server.store.activity!;
    const student = c.server.sessions.create('student');
    async function connect(url: string, cookie: string) {
      const socket = io(url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: url, Cookie: cookie },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    }
    const teacher = await connect(c.server.url, b.cookie);
    const pupil = await connect(c.server.studentUrl, c.server.sessions.cookie(student));
    const send = (socket: Socket, event: string, extra = {}) =>
      socket
        .timeout(2000)
        .emitWithAck(event, { activityId: activity.id, requestId: randomUUID(), ...extra });
    expect(await send(teacher, 'activity:subscribe')).toMatchObject({ ok: true });
    expect(
      await send(pupil, 'group:join', {
        groupId: [...activity.groups.keys()][0],
        name: '同步作答組',
      }),
    ).toMatchObject({ ok: true });
    expect(await send(teacher, 'activity:start')).toMatchObject({ ok: true });
    const googleBefore = { ...c.googleCalls };
    const id = c.histories[0]!;
    // Valid long answers retain the 30-group / 20-question / 40-row shape
    // while exercising encoder yields alongside real socket traffic.
    c.server.persistence.connection.transaction(() => {
      c.server.persistence.connection.database
        .prepare('UPDATE submission_answers SET answer=answer || ? WHERE activity_id=?')
        .run('長'.repeat(1800), id);
    });
    const generating = deferred<void>();
    const downloadService = c.server.resultExport!.download;
    let inGeneration = false;
    c.server.resultExport!.download = async (...args) => {
      inGeneration = true;
      generating.resolve();
      try {
        return await downloadService(...args);
      } finally {
        inGeneration = false;
      }
    };
    const start = performance.now();
    const exported = fetch(c.server.url + `/api/activities/${id}/export.csv`, {
      headers: c.client.headers,
    }).then(async (response) => ({
      status: response.status,
      bytes: Buffer.from(await response.arrayBuffer()),
    }));
    await generating.promise;
    const update = deferred<void>();
    teacher.on('teacher:progress', (message) => {
      if (message.submissions?.length === 1) update.resolve();
    });
    const q = activity.questions[0]!;
    const ack = await send(pupil, 'answer:submit', {
      questionId: q.id,
      answers: Object.fromEntries(q.items.map((item) => [item.id, '同時收件的完整答案'])),
    });
    expect(ack).toMatchObject({ ok: true });
    const answerDuringGeneration = inGeneration;
    await Promise.race([
      update.promise,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('LIVE_UPDATE_DEADLINE')), 2000);
        timer.unref();
      }),
    ]);
    const liveMs = performance.now() - start;
    expect(liveMs).toBeLessThanOrEqual(2000);
    const output = await exported;
    expect(answerDuringGeneration).toBe(true);
    expect(output.status).toBe(200);
    expect(output.bytes.toString('utf8')).toContain('合成答案30-20-2');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThanOrEqual(5000);
    expect(
      (await fetch(c.server.url + `/api/activities/${id}/export.csv`, { headers: b.headers }))
        .status,
    ).toBe(404);
    const second = await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
      headers: c.client.headers,
    });
    expect(second.status).toBe(200);
    await second.arrayBuffer();
    expect(
      (
        await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
          headers: c.client.headers,
        })
      ).status,
    ).toBe(429);
    const separate = await c.server.client();
    const sessionId = c.server.sessions.find(separate.cookie, 'teacher')!.sessionId;
    const entered = deferred<void>();
    const cancelledDone = deferred<void>();
    let cancelledCode: unknown;
    const original = c.server.resultExport!.download;
    c.server.resultExport!.download = async (...args) => {
      const work = original(...args);
      if (args[0] === sessionId) entered.resolve();
      try {
        return await work;
      } catch (error) {
        if (args[0] === sessionId) cancelledCode = (error as { code?: unknown }).code;
        throw error;
      } finally {
        if (args[0] === sessionId) cancelledDone.resolve();
      }
    };
    const controller = new AbortController();
    const cancelled = fetch(c.server.url + `/api/activities/${id}/export.csv`, {
      headers: separate.headers,
      signal: controller.signal,
    })
      .then((response) => response.arrayBuffer())
      .catch(() => null);
    await entered.promise;
    controller.abort();
    await cancelled;
    await cancelledDone.promise;
    expect(cancelledCode).toBe('EXPORT_BUSY');
    const retry = await fetch(c.server.url + `/api/activities/${id}/export.csv`, {
      headers: separate.headers,
    });
    expect(retry.status).toBe(200);
    expect((await retry.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(c.googleCalls).toEqual(googleBefore);
    console.info(
      JSON.stringify({
        scenario: 'concurrent-export-live-answer',
        groups: 30,
        questions: 20,
        dataRows: 40,
        exportMs: Math.round(elapsed),
        liveMs: Math.round(liveMs),
        sameOwnerSeparateSession: true,
        answerDuringGeneration,
      }),
    );
  } finally {
    for (const socket of sockets) socket.disconnect();
    await c.close();
  }
});
