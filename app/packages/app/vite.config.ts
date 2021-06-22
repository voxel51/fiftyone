import path from "path";
import { UserConfig } from "vite";
import reactRefresh from "@vitejs/plugin-react-refresh";

export default {
  plugins: [
    reactRefresh({
      parserPlugins: ["classProperties", "classPrivateProperties"],
    }),
  ],
} as UserConfig;
