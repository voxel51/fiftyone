import { defineConfig } from "cypress";
import { customTasks } from "cypress/support/tasks";
import { DEFAULT_APP_ADDRESS } from "lib/constants";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on("task", {
        ...customTasks,
      });
    },
    // note: don't include baseUrl here to 127.0.0.1:5151
    // because otherwise cypress will block until it's available
    // but we're spawning the app in python
    pageLoadTimeout: 5000,
    responseTimeout: 5000,
    baseUrl: DEFAULT_APP_ADDRESS,
  },
});
