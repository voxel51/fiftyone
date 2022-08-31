import { UserConfig } from "vite";

export default <UserConfig>{
  esbuild: true,
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
    },
    target: "es2015",
    minify: false,
  },
  resolve: {
    alias: {
      "@fiftyone/dataset": "@fiftyone/dataset/src/dataset.ts",
    },
  },
};
