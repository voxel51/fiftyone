import reactRefresh from "@vitejs/plugin-react-refresh";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { UserConfig } from "vite";
import relay from "vite-plugin-relay";

export default {
  base: "",
  plugins: [
    reactRefresh({
      parserPlugins: ["classProperties", "classPrivateProperties"],
    }),
    relay,
    nodePolyfills(),
  ],
} as UserConfig;
