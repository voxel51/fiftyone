import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@fiftyone/reverb"],
    },
    target: "es2015",
    minify: false,
  },
});
