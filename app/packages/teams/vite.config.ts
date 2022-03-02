import { UserConfig } from "vite";
import relay from "vite-plugin-relay";
import react from "@vitejs/plugin-react";

export default {
  base: "/",
  plugins: [
    react({ parserPlugins: ["classProperties", "classPrivateProperties"] }),
    relay,
  ],
  server: {
    https: true,
  },
  envDir: "./",
} as UserConfig;
