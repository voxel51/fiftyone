import { defineConfig } from "vite";
import "vitest/config";
import relay from "vite-plugin-relay";

const { DISABLE_COVERAGE } = process.env;

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["json", "lcov", "text", "html"],
      reportsDirectory: "./coverage",
      enabled: DISABLE_COVERAGE !== "true",
      all: true,
      exclude: [
        "**/__generated__/**",
        "**/__generated__",
        "**/.yarn/**",
        "**/.storybook/**",
        "node_modules",
      ],
    },
  },
  plugins: [relay],
  alias: {
    path: "path-browserify",
  },
});
