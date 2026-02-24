import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, UserConfig } from "vite";

export default defineConfig(({ mode }) => {
  const config: UserConfig = {
    plugins: [react()],
  };

  if (mode === "production") {
    config.build = {
      minify: true,
      lib: {
        entry: path.resolve(__dirname, "./src/index.ts"),
        formats: ["es"],
      },
      rollupOptions: {
        external: ["react", "react-dom"],
      },
      target: "es2015",
    };
  }

  return config;
});
