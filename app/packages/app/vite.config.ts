import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig, normalizePath, type Plugin } from "vite";
import relay from "vite-plugin-relay";
import svgr from "vite-plugin-svgr";
import wasm from "vite-plugin-wasm";

async function loadConfig() {
  return defineConfig({
    base: "",
    plugins: [
      svgr(),
      react(),
      relay,
      nodePolyfills(),
      foxgloveWasmAsUrl(),
      wasm(),
      // Vite's worker bundling breaks ort's WASM resolution and emits hashed
      // copies that ort can't find by name. Emit unhashed copies and clean up.
      (() => {
        const ortWasmFiles = [
          "ort-wasm-simd-threaded.jsep.wasm",
          "ort-wasm-simd-threaded.jsep.mjs",
        ];
        let assetsDir = "";
        return {
          name: "copy-ort-wasm",
          apply: "build",
          configResolved(config) {
            assetsDir = path.resolve(
              config.root,
              config.build.outDir,
              "assets",
            );
          },
          buildStart() {
            const ortDist = path.dirname(require.resolve("onnxruntime-web"));
            for (const f of ortWasmFiles) {
              this.emitFile({
                type: "asset",
                fileName: `assets/${f}`,
                source: fs.readFileSync(path.join(ortDist, f)),
              });
            }
          },
          closeBundle() {
            if (!fs.existsSync(assetsDir)) return;
            const keep = new Set(ortWasmFiles);
            for (const f of fs.readdirSync(assetsDir)) {
              if (f.includes("ort-wasm") && !keep.has(f)) {
                fs.unlinkSync(path.join(assetsDir, f));
              }
            }
          },
        };
      })(),
    ],
    assetsInclude: ["**/*.onnx"],
    define: {
      "import.meta.env.ORT_WASM_PATH": JSON.stringify("/assets/"),
    },
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
      rolldownOptions: {
        plugins: [foxgloveWasmOptimizeAsUrl()],
      },
    },
    worker: {
      format: "es",
      plugins: () => [foxgloveWasmAsUrl(), wasm()],
    },
    resolve: {
      alias: {
        path: "path-browserify",
        fs: path.resolve(__dirname, "fs-stub.js"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    build: {
      commonjsOptions: {
        // The @foxglove wasm packages locate their .wasm binaries with
        // `require("./<name>.wasm")`, which foxgloveWasmAsUrl() resolves
        // to a Vite `?url` module (a single default export holding the
        // asset URL string). Default CommonJS interop hands `require()`
        // the frozen module namespace instead of that string, and the
        // emscripten glue then crashes on `filename.startsWith(...)`.
        // Returning the default export for exactly these ids gives the
        // glue the URL string, matching the dev-mode esbuild shim.
        requireReturnsDefault: (id: string) =>
          /[\\/]@foxglove[\\/]wasm-(lz4|zstd|bz2)[\\/].*\.wasm\?url$/.test(id)
            ? "auto"
            : false,
      },
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
            return;
          }
          // @foxglove/rosmsg-serialization compiles message writers with
          // eval by design; the warning is not actionable from here
          if (
            warning.code === "EVAL" &&
            warning.id?.includes("@foxglove/rosmsg-serialization")
          ) {
            return;
          }
          warn(warning);
        },
        // No manual chunking: rolldown's emulation of function-form
        // manualChunks pulls each matched library's entire dependency
        // closure (react-dom, clsx, transition-group, lodash internals)
        // into the forced chunk and re-exports module-init helpers across
        // chunk boundaries, which can execute modules before their
        // initializers run. Rolldown already gives dynamically-imported
        // panels (plotly, mapbox, recharts, html2canvas) their own chunks.
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
        "/runtime-assets": {
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

function foxgloveWasmAsUrl(): Plugin {
  return {
    name: "foxglove-wasm-as-url",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (
        !source.endsWith(".wasm") ||
        !importer ||
        !/[\\/]node_modules[\\/]@foxglove[\\/]wasm-(lz4|zstd|bz2)[\\/]/.test(
          importer,
        )
      ) {
        return null;
      }

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) {
        return null;
      }

      return `${resolved.id}?url`;
    },
  };
}

function foxgloveWasmOptimizeAsUrl(): Plugin {
  const prefix = "\0foxglove-wasm-url:";
  const wrapperPattern =
    /[\\/]node_modules[\\/]@foxglove[\\/](?:wasm-(lz4|zstd)[\\/]dist[\\/]wasm-(lz4|zstd)|wasm-bz2[\\/]wasm[\\/]module)\.js$/;

  return {
    name: "foxglove-wasm-url",
    resolveId(source, importer) {
      if (
        !/^\.\/(?:wasm-(?:lz4|zstd)|module)\.wasm$/.test(source) ||
        !importer ||
        !wrapperPattern.test(importer)
      ) {
        return null;
      }

      return prefix + path.resolve(path.dirname(importer), source);
    },
    load(id) {
      if (!id.startsWith(prefix)) {
        return null;
      }

      return `module.exports = ${JSON.stringify(
        `/@fs/${normalizePath(id.slice(prefix.length))}`,
      )};`;
    },
  };
}

export default loadConfig();
