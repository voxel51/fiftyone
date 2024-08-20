import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { Duration } from "src/oss/utils";

dotenv.config({ path: process.env.CI ? ".env.ci" : ".env.dev" });
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src",
  testMatch: "**/?(*.)+(spec).ts?(x)",
  timeout: process.env.USE_DEV_BUILD
    ? Duration.Minutes(10)
    : Duration.Seconds(60),
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI || process.env.IS_UTILITY_DOCKER ? 3 : 0,
  /* Use max workers */
  workers: process.env.USE_DEV_BUILD || process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter:
    process.env.CI || process.env.IS_UTILITY_DOCKER
      ? [["line"], ["html", { open: "never" }], ["github"]]
      : [["line", { printSteps: true }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: process.env.CI ? "on-all-retries" : "retain-on-failure",
    // todo: change this to data-testid after we migrate off of cypress
    testIdAttribute: "data-cy",
  },
  expect: {
    toHaveScreenshot: {
      // since label color assignment is non-deterministic, we allow a small amount of pixel difference
      maxDiffPixelRatio: 0.01,
    },
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        bypassCSP: true,
        launchOptions: { args: ["--disable-web-security"] },
      },
    },
  ],
});
