import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FiftyOneViewBar",
      fileName: (format) => `index.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "@fiftyone/reverb", "@fiftyone/state"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@fiftyone/reverb": "reverb",
          "@fiftyone/state": "__fos__",
        },
      },
    },
  },
});
