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
  // The slowest legitimate test is ~30s; a tight cap bounds what a hung
  // test can burn across retries. Slow specs set their own timeout.
  timeout: Duration.Seconds(90),

  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI || process.env.IS_UTILITY_DOCKER ? 1 : 0,
  // One worker per CI shard: 2 workers on a 4-vCPU runner was tried and
  // contention made tests time out (20 failures on an otherwise-green
  // shard). Scale via shard count in e2e.yml instead.
  workers: process.env.CI ? 1 : undefined,
  /* Suppress "slow test file" warning annotations on the GitHub summary page */
  reportSlowTests: null,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? // blob reports are merged across shards into the authoritative PR
      // comment and combined HTML report (see e2e-report in e2e.yml); no
      // github reporter — its per-shard run summaries duplicate both
      [["line"], ["blob"]]
    : process.env.IS_UTILITY_DOCKER
      ? [["line"], ["html", { open: "never" }]]
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
      maxDiffPixelRatio: 0.02,
    },
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: {
          permissions: ["clipboard-read", "clipboard-write"],
        },
        channel: "chromium",
        bypassCSP: true,
        launchOptions: { args: ["--disable-web-security"] },
      },
    },
  ],
});
