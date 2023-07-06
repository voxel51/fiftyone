import { defineConfig } from "vite";
import "vitest/config";
import relay from "vite-plugin-relay";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["json", "lcov", "text", "html"],
      reportsDirectory: "./coverage",
      enabled: true,
      all: true,
      exclude: [
        "**/__generated__/**",
        "**/__generated__",
        "**/.yarn/**",
        "**/.storybook/**",
      ],
    },
  },
  plugins: [relay],
});
