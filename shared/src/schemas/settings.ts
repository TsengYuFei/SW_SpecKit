import { z } from 'zod';
import { idSchema } from './common.js';
export const settingsSchema = z.strictObject({
  defaultGroupCount: z.number().int().min(1).max(10000),
});
export const saveSettingsSchema = settingsSchema.extend({ requestId: idSchema });
