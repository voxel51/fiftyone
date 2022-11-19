import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { UserConfig } from "vite";
import relay from "vite-plugin-relay";

export default <UserConfig>{
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["lcov"],
      reportsDirectory: "../../coverage",
    },
  },
  plugins: [
    reactRefresh({
      parserPlugins: ["classProperties", "classPrivateProperties"],
    }),
    relay,
    nodePolyfills(),
  ],
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
