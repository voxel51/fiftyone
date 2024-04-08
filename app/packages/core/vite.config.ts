import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";

export default defineConfig(({ mode }) => {
  const serverPort =
    process.env.FIFTYONE_SERVER_PORT ??
    process.env.FIFTYONE_DEFAULT_APP_PORT ??
    "5151";

  return {
    base: mode === "desktop" ? "" : "/",
    plugins: [
      reactRefresh({
        parserPlugins: ["classProperties", "classPrivateProperties"],
      }),
      relay,
      nodePolyfills(),
    ],
    server: {
      proxy: {
        "/plugins": {
          target: `http://localhost:${serverPort}`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
        "/aggregate": {
          target: `http://localhost:${serverPort}`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
      },
    },
  };
});
