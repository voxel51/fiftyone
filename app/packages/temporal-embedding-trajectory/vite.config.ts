import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteExternalsPlugin } from "vite-plugin-externals";

const isPluginBuild = process.env.STANDALONE !== "true";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    isPluginBuild
      ? viteExternalsPlugin({
          react: "React",
          "react-dom": "ReactDOM",
          recoil: "recoil",
          "@fiftyone/state": "__fos__",
          "@fiftyone/playback": "__fopb__",
          "@fiftyone/operators": "__foo__",
          "@fiftyone/spaces": "__fosp__",
          "@fiftyone/components": "__foc__",
        })
      : undefined,
  ],
  build: {
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "./src/index.ts"),
      name: "TemporalEmbeddingTrajectory",
      fileName: (format) => `index.${format}.js`,
      formats: ["umd"],
    },
  },
  define: {},
  optimizeDeps: {
    exclude: ["react", "react-dom"],
  },
});
