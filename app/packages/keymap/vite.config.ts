import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FiftyOneKeymap",
      fileName: (format) => `index.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "jotai"],
      output: {
        globals: {
          react: "React",
          jotai: "jotai",
        },
      },
    },
  },
});
