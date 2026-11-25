import { z } from 'zod';

export const googleIdentitySchema = z.strictObject({
  sub: z.string().min(1),
  email: z.string(),
  displayName: z.string(),
});
export type GoogleIdentity = z.infer<typeof googleIdentitySchema>;
export const publicAccountSchema = googleIdentitySchema.omit({ sub: true });
