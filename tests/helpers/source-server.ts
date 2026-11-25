import type { GoogleGateway } from '../../backend/src/google/sheets-client.js';
import { sampleSheet } from '../fixtures/guided-notes.js';
import { catalogServer } from './catalog-server.js';
import { googleReadDouble } from './google-adapter.js';
import type { PersistenceFixture } from './persistence.js';

export function fakeGateway(): GoogleGateway {
  const reader = googleReadDouble(async () => [sampleSheet(), sampleSheet(12, 5, 2)]);
  return {
    authorizationUrl: (state) => `/fake-google?state=${state}`,
    exchange: async () => ({ access_token: 'invalid-demo-token' }),
    read: reader.read,
    write: async () => {
      throw new Error('來源測試不得回寫');
    },
  };
}

export async function sourceServer(
  role: 'teacher' | 'student' = 'teacher',
  persistence?: PersistenceFixture,
) {
  return catalogServer(role, persistence);
}
