import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import "vitest/config";

const { DISABLE_COVERAGE } = process.env;

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // fresh module registry per file (so vi.mock stays file-local) over a
    // shared compiled-code cache — keeps most of the import savings without
    // cross-file module-graph leakage
    pool: "vmThreads",
    server: {
      deps: {
        inline: [
          "plotly.js",
          "react-plotly.js",
          "@rjsf/mui",
          "@rjsf/core",
          "react-datepicker",
        ],
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
