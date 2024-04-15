import { UserConfig } from "vite";

export default <UserConfig>{
  esbuild: {},
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    target: "es2022",
    minify: false,
  },
};
