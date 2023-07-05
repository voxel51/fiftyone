import { defineConfig, devices } from "@playwright/test";
import { Duration } from "src/oss/utils";
import dotenv from "dotenv";
import { getPythonCommand } from "src/oss/utils/commands";

dotenv.config({ path: process.env.CI ? ".env.ci" : ".env.dev" });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src",
  testMatch: "**/?(*.)+(spec).ts?(x)",
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1, // process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL:
      !process.env.CI && process.env.USE_DEV_BUILD
        ? "http://localhost:5173"
        : "http://0.0.0.0:8787",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    // todo: change this to data-testid after we migrate off of cypress
    testIdAttribute: "data-cy",
  },

  // globalSetup: require.resolve("./src/oss/fixtures/global-setup.ts"),

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: getPythonCommand([
      "../fiftyone/server/main.py",
      "--address",
      "0.0.0.0",
      "--port",
      "8787",
      "--clean_start",
    ]),
    url: "http://0.0.0.0:8787",
    reuseExistingServer: !process.env.CI,
    env: {
      FIFTYONE_DATABASE_NAME: "playwright",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
