import { defineConfig } from "vite";
import "vitest/config";
import relay from "vite-plugin-relay";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      reporter: ["json", "lcov"],
      reportsDirectory: "./coverage",
    },
    alias: {
      "@fiftyone/state": path.resolve(
        __dirname,
        "./packages/spaces/src/AppModules.tsx"
      ),
      "@fiftyone/plugins": path.resolve(
        __dirname,
        "./packages/spaces/src/AppModules.tsx"
      ),
      "@fiftyone/components": path.resolve(
        __dirname,
        "./packages/spaces/src/AppModules.tsx"
      ),
    },
  },
  plugins: [react(), relay],
});
