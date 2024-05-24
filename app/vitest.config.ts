import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: process.env.COVERAGE !== "false",
    },
  },
});
