import react from "@vitejs/plugin-react";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";

export default defineConfig(({ mode }) => {
  return {
    base: mode === "desktop" ? "" : "/",
    plugins: [react(), relay, nodePolyfills()],
    server: {
      proxy: {
        "/plugins": {
          target: `http://localhost:${
            process.env.FIFTYONE_DEFAULT_APP_PORT ?? "5151"
          }`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
        "/aggregate": {
          target: `http://localhost:${
            process.env.FIFTYONE_DEFAULT_APP_PORT ?? "5151"
          }`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
      },
    },
  };
});
