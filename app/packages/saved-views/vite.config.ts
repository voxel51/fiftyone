import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FiftyOneSavedViews",
      fileName: (format) => `index.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "recoil", "@fiftyone/state"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          recoil: "recoil",
          "@fiftyone/state": "__fos__",
        },
      },
    },
  },
});
