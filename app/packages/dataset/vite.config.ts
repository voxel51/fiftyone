import { UserConfig } from "vite";
import nodePolyfills from "rollup-plugin-polyfill-node";
import relay from "vite-plugin-relay";
import { viteExternalsPlugin } from "vite-plugin-externals";

export default <UserConfig>{
  esbuild: true,
  plugins: [
    relay,
    nodePolyfills(),
    viteExternalsPlugin({
      react: "React",
      "react-dom": "ReactDOM",
      recoil: "recoil",
      "recoil-relay": "recoilRelay",
      "relay-runtime": "relayRuntime",
    }),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
    },
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
