import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import relay from "vite-plugin-relay";
import { defineConfig } from "vite";
export default defineConfig(({ command }) => {
  const serve = command === "serve";
  const testApp = serve;
  return {
    plugins: [
      testApp &&
        reactRefresh({
          parserPlugins: ["classProperties", "classPrivateProperties"],
        }),
      relay,
      nodePolyfills() as unknown as undefined,
    ],
  };
});
