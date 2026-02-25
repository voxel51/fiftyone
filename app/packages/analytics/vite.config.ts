import { ESBuildOptions, UserConfig } from "vite";

export default <UserConfig>{
  esbuild: {} as ESBuildOptions,
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    target: "es2015",
    minify: false,
  },
  resolve: {
    alias: {
      "@fiftyone/looker": "@fiftyone/looker/src/index.ts",
    },
  },
};
