import type { UserConfig } from "vite";

export default {
  esbuild: {},
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    target: "es2022",
    minify: false,
  },
  test: {},
} as UserConfig;
