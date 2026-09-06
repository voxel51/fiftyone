import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The hook tests never touch the App: every seam (panel-event trigger,
// operator executor, event source) is injected, so nothing here needs the
// @fiftyone/* portals to resolve at runtime.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
