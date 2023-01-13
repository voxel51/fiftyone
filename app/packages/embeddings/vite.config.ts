import { defineConfig, UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteExternalsPlugin } from "vite-plugin-externals";

const isPluginBuild = process.env.STANDALONE !== "true";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config: UserConfig = {
    mode,
    plugins: [react()],
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
  };

  if ((mode === "production" || isPluginBuild) && config.plugins) {
    config.plugins.push(
      viteExternalsPlugin({
        react: "React",
        "react-dom": "ReactDOM",
        recoil: "recoil",
        "@fiftyone/state": "__fos__",
        "@fiftyone/components": "__foc__",
        "@fiftyone/plugins": "__fop__",
        "@fiftyone/spaces": "__fos__",
        "@fiftyone/utilities": "__fou__",
        "@mui/icons-material": "__muiim__",
        "styled-components": "StyledComponents",
        typescript: "Typescript",
        "react-plotly.js": "react-plotly.js",
      })
    );
  }

  return config;
});
