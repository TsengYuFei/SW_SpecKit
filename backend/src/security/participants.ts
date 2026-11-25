import { createHash } from 'node:crypto';

export function participantDigest(cookieToken: string) {
  return createHash('sha256').update(cookieToken).digest('hex');
}
