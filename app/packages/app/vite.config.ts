import fs from "node:fs";
import path from "node:path";
import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig, normalizePath, type Plugin } from "vite";
import relay from "vite-plugin-relay";
import svgr from "vite-plugin-svgr";
import wasm from "vite-plugin-wasm";
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
              "assets"
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
      esbuildOptions: {
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
          warn(warning);
        },
        output: {
          // Give the heavy, lazily-loaded vendor libs their own deterministic
          // chunks so rollup doesn't hoist them into the entry or glue them
          // together (e.g. mapbox + plotly landing in one blob). Each only
          // loads when its panel/view opens.
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (/[\\/](mapbox-gl|@mapbox)[\\/]/.test(id)) return "mapbox-gl";
              if (/[\\/]plotly\.js/.test(id) || /react-plotly\.js/.test(id))
                return "plotly";
              if (/[\\/]recharts[\\/]/.test(id)) return "recharts";
              if (/[\\/]html2canvas[\\/]/.test(id)) return "html2canvas";
            }
          },
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
          importer
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

function foxgloveWasmOptimizeAsUrl() {
  const namespace = "foxglove-wasm-url";
  const wrapperPattern =
    /[\\/]node_modules[\\/]@foxglove[\\/](?:wasm-(lz4|zstd)[\\/]dist[\\/]wasm-(lz4|zstd)|wasm-bz2[\\/]wasm[\\/]module)\.js$/;

  return {
    name: "foxglove-wasm-url",
    setup(build) {
      build.onResolve({ filter: /^\.\/(?:wasm-(?:lz4|zstd)|module)\.wasm$/ }, (args) => {
        if (!wrapperPattern.test(args.importer)) {
          return undefined;
        }

        return {
          namespace,
          path: path.resolve(args.resolveDir, args.path),
        };
      });

      build.onLoad({ filter: /.*/, namespace }, (args) => ({
        contents: `module.exports = ${JSON.stringify(
          `/@fs/${normalizePath(args.path)}`
        )};`,
        loader: "js",
      }));
    },
  };
}

export default loadConfig();
