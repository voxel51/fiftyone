import { UserConfig } from "vite";
import ts from "rollup-plugin-typescript2";

export default <UserConfig>{
  plugins: [
    {
      apply: "build",
      ...ts({
        tsconfig: "./tsconfig.build.json",
        useTsconfigDeclarationDir: true,
      }),
    },
  ],
  esbuild: false,
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    minify: false,
  },
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
};
