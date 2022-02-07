import { UserConfig } from "vite";
import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";


export default <UserConfig>{
  esbuild: true,
  server:{
    cors: true
  },
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
    },
    
    target: "es2015",
    minify: false,
    rollupOptions:{
      external: ["three"],
      input: {
        test: "src/test.tsx"
      }

    }
  },
  resolve: {
    alias: {
      "@fiftyone/viz3d": "@fiftyone/viz3d/src/index.tsx",
    },
  },
  plugins: [
    reactRefresh({
      parserPlugins: ["classProperties", "classPrivateProperties"],
    }),
    nodePolyfills(),
  ],
};

