import path from "path";
import { UserConfig } from "vite";

export default <UserConfig>{
  esbuild: true,
  build: {
    lib: {
      entry: path.resolve(__dirname, "lib/main.js"),
      name: "@fiftyone/components",
      fileName: (format) => `components.${format}.js`,
    },
  },
  rollupOptions: {
    external: ["react", "react-dom"],
  },
  resolve: {
    alias: {
      "@fiftyone/components": "@fiftyone/components/src/index.ts",
    },
  },
};
