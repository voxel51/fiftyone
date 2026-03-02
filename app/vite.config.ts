import { defineConfig as defineViteConfig, mergeConfig } from "vite";
import { defineConfig as defineVitestConfig } from "vitest/config";
import relay from "vite-plugin-relay";

const { DISABLE_COVERAGE } = process.env;

const vitestConfig = defineVitestConfig({
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
      exclude: [
        "**/__generated__/**",
        "**/__generated__",
        "**/.yarn/**",
        "**/.storybook/**",
        "node_modules",
      ],
    },
  },
});

const viteConfig = defineViteConfig({
  plugins: [relay],
  resolve: {
    alias: {
      path: "path-browserify",
    },
    // Ensure MUI can resolve properly in tests
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
  },
});

export default mergeConfig(viteConfig, vitestConfig);
