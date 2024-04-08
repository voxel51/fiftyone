import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import { basePlugins } from "../../vite.base.config";

async function loadConfig() {
  const pluginRewriteAll = (await import("vite-plugin-rewrite-all")).default;
  const serverPort =
    process.env.FIFTYONE_SERVER_PORT ??
    process.env.FIFTYONE_DEFAULT_APP_PORT ??
    "5151";

  return defineConfig({
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
    resolve: {
      alias: {
        path: "path-browserify",
      },
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
            return;
          }
          warn(warning);
        },
      },
    },
    server: {
      port: parseInt(process.env.FIFTYONE_DEFAULT_APP_PORT || "5173"),
      proxy: {
        "/plugins": {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
        "/aggregate": {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
      },
    },
  });
}

export default loadConfig();
