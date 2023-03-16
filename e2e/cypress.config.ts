import { defineConfig } from "cypress";
import { customTasks } from "cypress/support/tasks";
import { Duration } from "cypress/support/utils";
import { DEFAULT_APP_ADDRESS } from "lib/constants";

export default defineConfig({
  e2e: {
    baseUrl: DEFAULT_APP_ADDRESS,
    setupNodeEvents(on, config) {
      on("task", {
        ...customTasks,
      });
    },
    defaultCommandTimeout: Duration.Seconds(10),
    pageLoadTimeout: Duration.Seconds(5),
    responseTimeout: Duration.Seconds(5),
  },
});
