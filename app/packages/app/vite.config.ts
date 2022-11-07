import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";

export default defineConfig(({ mode }) => {
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
