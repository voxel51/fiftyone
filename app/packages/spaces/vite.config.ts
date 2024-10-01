import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, UserConfig } from "vite";
import { viteExternalsPlugin } from "vite-plugin-externals";
import relay from "vite-plugin-relay";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config: UserConfig = {
    plugins: [react(), relay],
  };

  if (mode === "production") {
    config.plugins.push(
      viteExternalsPlugin({
        react: "React",
        "react-dom": "ReactDOM",
        recoil: "recoil",
        "@fiftyone/state": "__fos__",
        "@fiftyone/components": "__foc__",
        "@fiftyone/plugins": "__fop__",
        "@mui/icons-material": "__muiim__",
        "re-resizable": "ReResizable",
        "styled-components": "StyledComponents",
        typescript: "Typescript",
      })
    );
    config.build = {
      minify: true,
      lib: {
        entry: path.resolve(__dirname, "./src/index.ts"),
        formats: ["es"],
      },
      target: "es2015",
    };
  }
  return config;
});
