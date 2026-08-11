import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import "vitest/config";

const { DISABLE_COVERAGE } = process.env;

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: ["plotly.js", "react-plotly.js", "@rjsf/mui", "@rjsf/core"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["json", "lcov", "text", "html"],
      reportsDirectory: "./coverage",
      enabled: DISABLE_COVERAGE !== "true",
      all: true,
      include: ["packages/*/src/**/*.{ts,tsx}", "packages/*/index.ts"],
      exclude: [
        "**/__generated__/**",
        "**/__generated__",
        "**/.yarn/**",
        "**/.storybook/**",
        "**/*.stories.{ts,tsx}",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/__tests__/**",
        "**/__mocks__/**",
        "**/*.d.ts",
        "node_modules",
      ],
    },
  },
  plugins: [relay],
  resolve: {
    alias: {
      path: "path-browserify",
    },
    // Ensure MUI can resolve properly in tests
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
  },
});
