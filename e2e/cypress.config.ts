import { defineConfig } from "cypress";
import getCompareSnapshotsPlugin from "cypress-visual-regression/dist/plugin";
import { customTasks } from "./cypress/support/tasks";
import { Duration } from "./cypress/support/utils";
import { DEFAULT_APP_ADDRESS } from "./lib/constants";

export default defineConfig({
  env: {
    /** begin: env for cypress-visual-regression */
    failSilently: false,
    // if true, will fail the test if there's a visual regression
    ALLOW_VISUAL_REGRESSION_TO_FAIL: true,
    // only generate diffs for failed tests
    ALWAYS_GENERATE_DIFF: false,
    /** end: env for cypress-visual-regression */
  },
  e2e: {
    baseUrl: DEFAULT_APP_ADDRESS,
    videoUploadOnPasses: false,
    // retry once on test failure to account for random errors
    // note: this is a global config, this can be configured per-test as well
    retries: 1,
    setupNodeEvents(on, config) {
      getCompareSnapshotsPlugin(on, config);

      // note: we're favoring headed mode for now because of a cypress bug,
      // so the following might not be relevant, yet,
      // but will be in the future when we run visual regression tests in headless mode
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.name === "chrome" && browser.isHeadless) {
          // fullPage screenshot size is 1200x800 on non-retina screens
          launchOptions.args.push("--window-size=1200,800");

          // force screen to be non-retina (1200x800 size)
          launchOptions.args.push("--force-device-scale-factor=1");
        }

        if (browser.name === "electron" && browser.isHeadless) {
          // fullPage screenshot size is 1200x800
          launchOptions.preferences.width = 1200;
          launchOptions.preferences.height = 800;
        }

        if (browser.name === "firefox" && browser.isHeadless) {
          // menubars take up height on the screen (74 px)
          // so fullPage screenshot size is 726
          launchOptions.args.push("--width=1200");
          launchOptions.args.push("--height=726");
        }

        return launchOptions;
      });

      on("task", {
        ...customTasks,
      });
    },
    defaultCommandTimeout: Duration.Seconds(10),
    pageLoadTimeout: Duration.Seconds(5),
    responseTimeout: Duration.Seconds(5),
    viewportWidth: 1200,
    viewportHeight: 800,
    chromeWebSecurity: false,
    screenshotsFolder: "cypress/snapshots/actual",
  },
});
