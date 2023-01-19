import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import { basePlugins } from "../../vite.base.config";
import pluginRewriteAll from "vite-plugin-rewrite-all";

export default defineConfig(() => {
  return {
    base: "",
    plugins: [
      ...basePlugins,
      reactRefresh({
        parserPlugins: ["classProperties", "classPrivateProperties"],
      }),
      relay,
      nodePolyfills(),
      // pluginRewriteAll to address this vite bug: https://github.com/vitejs/vite/issues/2415
      pluginRewriteAll(),
    ],
    server: {
      proxy: {
        "/plugins": {
          target: "http://127.0.0.1:5151",
          changeOrigin: false,
          secure: false,
          ws: false,
        },
        "/aggregate": {
          target: "http://127.0.0.1:5151",
          changeOrigin: false,
          secure: false,
          ws: false,
        },
      },
    },
  };
});
