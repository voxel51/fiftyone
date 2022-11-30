import { defineConfig } from "vite";
import "vitest/config";
import relay from "vite-plugin-relay";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["json", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
  plugins: [relay],
});
