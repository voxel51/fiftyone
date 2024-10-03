import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  mode: "development",
  plugins: [react()],
  build: {
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "./src/index.ts"),
      name: "Debugger",
      fileName: (format) => `index.${format}.js`,
      formats: ["umd"],
    },
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  optimizeDeps: {
    exclude: ["react", "react-dom"],
  },
});
