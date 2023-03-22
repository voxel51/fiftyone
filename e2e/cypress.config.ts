import { defineConfig } from "cypress";
import getCompareSnapshotsPlugin from "cypress-visual-regression/dist/plugin";
import { customTasks } from "./cypress/support/tasks";
import { Duration } from "./cypress/support/utils";
import { DEFAULT_APP_ADDRESS } from "./lib/constants";

export default defineConfig({
  env: {
    // for cypress-visual-regression
    failSilently: false,
    ALLOW_VISUAL_REGRESSION_TO_FAIL: false,
    ALWAYS_GENERATE_DIFF: true,
  },
  e2e: {
    baseUrl: DEFAULT_APP_ADDRESS,
    videoUploadOnPasses: false,
    setupNodeEvents(on, config) {
      getCompareSnapshotsPlugin(on, config);

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
    // screenshotsFolder: "cypress/snapshots/base",
  },
});
