import { expect, it } from 'vitest';
import { resultExportFixture } from '../helpers/result-export.js';
import { createResultExportService } from '../../backend/src/activity/result-export-service.js';
import { createExportGate } from '../../backend/src/export/export-gate.js';
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
