import { defineConfig } from "vitest/config";

export default defineConfig({
  // @voxel51/voodo is linked from a sibling workspace that brings its own
  // copy of react. Without dedupe, hook-using components (Button via
  // @headlessui/react) blow up with "Cannot read properties of null
  // (reading 'useContext')" because there are two React instances.
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
