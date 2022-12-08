import path from "path";
import { defineConfig, UserConfig } from "vite";
import reactRefresh from "@vitejs/plugin-react-refresh";
import relay from "vite-plugin-relay";
import { viteExternalsPlugin } from "vite-plugin-externals";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config: UserConfig = {
    plugins: [
      reactRefresh({
        parserPlugins: ["classProperties", "classPrivateProperties"],
      }),
      relay,
    ],
  };

  if (mode === "production") {
    config.plugins.push(
      viteExternalsPlugin({
        react: "React",
        "react-dom": "ReactDOM",
        recoil: "recoil",
        "@fiftyone/state": "__fos__",
      })
    );
    config.build = {
      minify: true,
      lib: {
        entry: path.resolve(__dirname, "./src/SpacesRoot.tsx"),
        formats: ["es"],
      },
      target: "es2015",
    };

    config.optimizeDeps = {
      exclude: ["react", "react-dom"],
    };
  } else {
    config.resolve = {
      alias: {
        "@fiftyone/state": path.resolve(__dirname, "./src/AppModules.tsx"),
        "@fiftyone/plugins": path.resolve(__dirname, "./src/AppModules.tsx"),
        "@fiftyone/components": path.resolve(__dirname, "./src/AppModules.tsx"),
      },
    };
  }
  return config;
});
