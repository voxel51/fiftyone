import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteExternalsPlugin } from "vite-plugin-externals";

const isPluginBuild = process.env.STANDALONE !== "true";

// https://vitejs.dev/config/
export default defineConfig({
  mode: "development",
  plugins: [
    react(),
    isPluginBuild
      ? viteExternalsPlugin({
          react: "React",
          "react-dom": "ReactDOM",
          recoil: "recoil",
          "@fiftyone/state": "__fos__",
        })
      : undefined,
  ],
  build: {
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "./src/index.ts"),
      name: "Embeddings",
      fileName: (format) => `index.${format}.js`,
      formats: ["umd"],
    },
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  optimizeDeps: {
    exclude: ["react", "react-dom"],
  },
});
