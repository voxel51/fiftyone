import { defineConfig } from "vitest/config";
import relay from "vite-plugin-relay";

export default defineConfig({
  // Modules that reach the @fiftyone/state barrel drag in @fiftyone/relay,
  // whose graphql`` tags throw at import time unless the relay babel
  // transform runs — same plugin the app build and sibling packages use.
  plugins: [relay],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["../../vitest.setup.ts"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
