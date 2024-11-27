import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables based on CI or development mode
dotenv.config({ path: process.env.CI ? '.env.ci' : '.env.dev' });

export const STORAGE_STATE_PATH = 'playwright/.auth/user.json';

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
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to ensure no parallel execution
  timeout: 60000,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',
    baseURL: process.env.BASE_URL
  },

  // Define test projects
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
