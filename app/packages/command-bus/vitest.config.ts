import { defineConfig } from "vitest/config.js";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
