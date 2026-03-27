import fs from "fs";
import path from "path";
import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import svgr from "vite-plugin-svgr";
import { basePlugins } from "../../vite.base.config";

async function loadConfig() {
  const pluginRewriteAll = (await import("vite-plugin-rewrite-all")).default;

  return defineConfig({
    base: "",
    plugins: [
      ...basePlugins,
      svgr(),
      reactRefresh({
        parserPlugins: ["classProperties", "classPrivateProperties"],
      }),
      relay,
      nodePolyfills(),
      // pluginRewriteAll to address this vite bug: https://github.com/vitejs/vite/issues/2415
      pluginRewriteAll(),
      // In production, the worker bundle strips ort's embedded WASM.
      // Emit the WASM runtime files so ort can load them at runtime.
      {
        name: "copy-ort-wasm",
        apply: "build",
        buildStart() {
          const ortDist = path.dirname(require.resolve("onnxruntime-web"));
          for (const f of ["ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"]) {
            this.emitFile({ type: "asset", fileName: `assets/${f}`, source: fs.readFileSync(path.join(ortDist, f)) });
          }
        },
      },
    ],
    assetsInclude: ["**/*.onnx"],
    define: {
      "import.meta.env.ORT_WASM_PATH": JSON.stringify("/assets/"),
    },
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
    resolve: {
      alias: {
        path: "path-browserify",
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
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
      allowedHosts: true,
      host: true,
      port: Number.parseInt(process.env.FIFTYONE_DEFAULT_APP_PORT || "5173"),
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
      proxy: {
        "/plugins": {
          target: `http://127.0.0.1:${
            process.env.FIFTYONE_DEFAULT_APP_PORT ?? "5151"
          }`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
        "/aggregate": {
          target: `http://127.0.0.1:${
            process.env.FIFTYONE_DEFAULT_APP_PORT ?? "5151"
          }`,
          changeOrigin: false,
          secure: false,
          ws: false,
        },
      },
    },
  });
}

export default loadConfig();
