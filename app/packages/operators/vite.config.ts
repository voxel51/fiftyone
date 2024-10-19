import { UserConfig } from "vite";

export default <UserConfig>{
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
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["node_modules", "dist"],
  },
};
