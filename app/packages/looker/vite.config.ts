import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.+)/, replacement: resolve(__dirname, "$1") }],
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "@fiftyone/looker",
      formats: ["es"],
      fileName: "looker",
    },
    rollupOptions: {
      external: [],
    },
  },
  plugins: [
    dts({
      outputDir: "types",
      staticImport: true,
      insertTypesEntry: true,
    }),
  ],
});
