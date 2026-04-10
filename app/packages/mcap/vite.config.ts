import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteExternalsPlugin } from "vite-plugin-externals";

const isPluginBuild = process.env.STANDALONE !== "true";

export default defineConfig({
  mode: "development",
  plugins: [
    react(),
    isPluginBuild
      ? viteExternalsPlugin({
          react: "React",
          "react-dom": "ReactDOM",
        })
      : undefined,
  ],
  build: {
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "./src/index.ts"),
      name: "Mcap",
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
