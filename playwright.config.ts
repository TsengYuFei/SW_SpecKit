import { defineConfig } from '@playwright/test';
import { playwrightDatabaseForRun } from './tests/helpers/playwright-database.js';

const testDatabase = playwrightDatabaseForRun();

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { channel: 'msedge', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3010/api/health',
    env: testDatabase.webServerEnv({
      TEACHER_PORT: '3010',
      STUDENT_PORT: '3011',
      STUDENT_PUBLIC_ORIGIN: 'http://127.0.0.1:3011',
    }),
    reuseExistingServer: false,
  },
});
