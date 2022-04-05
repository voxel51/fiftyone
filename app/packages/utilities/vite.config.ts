import { UserConfig } from "vite";

export default <UserConfig>{
  esbuild: true,
  base: "/",
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    base: "/",
    target: "es2015",
    minify: false,
  },
};
