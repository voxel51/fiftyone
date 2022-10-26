import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import relay from "vite-plugin-relay";
import { defineConfig } from "vite";
import { viteExternalsPlugin } from "vite-plugin-externals";

export default defineConfig(({ command }) => {
  const serve = command === "serve";
  const testApp = serve;
  const embed = !serve;

  return {
    esbuild: true,
    plugins: [
      testApp &&
        reactRefresh({
          parserPlugins: ["classProperties", "classPrivateProperties"],
        }),
      relay,
      nodePolyfills(),
      embed &&
        viteExternalsPlugin({
          react: "React",
          "react-dom": "ReactDOM",
          recoil: "recoil",
          "recoil-relay": "recoilRelay",
          "relay-runtime": "relayRuntime",
        }),
    ],
    build: {
      lib: embed
        ? {
            entry: "src/index.ts",
            formats: ["cjs"],
          }
        : null,
      target: "es2015",
      minify: false,
      sourcemap: "inline",
    },
    resolve: {
      alias: {
        "@fiftyone/dataset": "@fiftyone/dataset/src/dataset.ts",
      },
    },
  };
});
