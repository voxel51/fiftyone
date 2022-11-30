import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import relay from "vite-plugin-relay";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["lcov"],
      reportsDirectory: "./coverage",
    },
    exclude: [...configDefaults.exclude, "packages/plugins/**"],
  },
  plugins: [relay],
});
