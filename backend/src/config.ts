import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const configSchema = z.object({
  TEACHER_PORT: port.default(3000),
  STUDENT_PORT: port.default(3001),
  STUDENT_BIND_HOST: z.ipv4().default('127.0.0.1'),
  STUDENT_PUBLIC_ORIGIN: z.url().default('http://127.0.0.1:3001'),
  MAX_GROUPS: z.coerce.number().int().min(1).max(10000).default(100),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.literal('http://127.0.0.1:3000/api/google/callback').optional(),
});

export type Config = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`設定無效，請檢查 ${fields.join('、')}`);
  }
  const origin = new URL(parsed.data.STUDENT_PUBLIC_ORIGIN);
  if (
    origin.protocol !== 'http:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('請檢查 STUDENT_PUBLIC_ORIGIN，須為無路徑的 HTTP 來源');
  }
  if (parsed.data.TEACHER_PORT === parsed.data.STUDENT_PORT) {
    throw new Error('TEACHER_PORT 與 STUDENT_PORT 須不同');
  }
  return parsed.data;
}
