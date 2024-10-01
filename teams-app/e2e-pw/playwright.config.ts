import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.CI ? '.env.ci' : '.env.dev' });

export const STORAGE_STATE_PATH = 'playwright/.auth/user.json';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/?(*.)+(spec).ts?(x)',
  testIgnore: [
    'node_modules',
    'playwright',
    'scripts',
    'playwright-report',
    'older-specs'
  ],
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Use max workers */
  workers: undefined,
  timeout: 60000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    baseURL: process.env.BASE_URL
  },
  projects: [
    {
      name: 'keycloak-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'keycloak.auth.ts'
    },
    {
      name: 'tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE_PATH
      },
      dependencies: ['keycloak-auth'],
      testMatch: 'src/specs/**',
      testIgnore: 'src/specs/older-specs/**'
    }
  ]
});
