import type { Envelope } from '@classroom/shared/events/envelope';

export async function http<T>(path: string, csrfToken?: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('網路連線中斷，請檢查連線後重試。');
  }
  const result = (await response.json()) as Envelope<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
