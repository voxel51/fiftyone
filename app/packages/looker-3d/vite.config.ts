import * as path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteExternalsPlugin } from "vite-plugin-externals";

// Vitest sets VITEST; the externals plugin must not apply under test. It
// rewrites react / react-dom / recoil / @fiftyone/state to `window.*` globals
// for the plugin bundle, which in a test run resolves to a shim that throws
// "window is not defined" at import time — silently preventing every test file
// that imports React or Recoil from loading at all.
const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isPluginBuild = !isTest && process.env.STANDALONE !== "true";

// https://vitejs.dev/config/
export default defineConfig({
  mode: "development",
  plugins: [
    react(),
    isPluginBuild
      ? viteExternalsPlugin({
          react: "React",
          "react-dom": "ReactDOM",
          recoil: "recoil",
          "@fiftyone/state": "__fos__",
        })
      : undefined,
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/PointCloudPlugin.tsx"),
      name: "PointCloudPlugin",
      fileName: (format) => `index.${format}.js`,
      formats: ["umd"],
    },
    minify: false,
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  optimizeDeps: {
    exclude: ["react", "react-dom"],
  },
  publicDir: isPluginBuild ? null : "example_data",
  test: {
    // Component and hook tests render with React, so they need a DOM.
    environment: "jsdom",
  },
});
