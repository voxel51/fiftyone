import { UserConfig } from "vite";
import inject from "@rollup/plugin-inject";

export default <UserConfig>{
  esbuild: true,
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    rollupOptions: {
      plugins: [inject({ Buffer: ["Buffer", "Buffer"] })],
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
