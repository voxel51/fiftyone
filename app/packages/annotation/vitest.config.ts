import { defineConfig } from "vitest/config";
import relay from "vite-plugin-relay";

export default defineConfig({
  plugins: [relay],
  test: {
    environment: "jsdom",
  },
});
