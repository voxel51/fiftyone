import relay from "vite-plugin-relay";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [relay],
  test: {
    environment: "jsdom",
  },
});
