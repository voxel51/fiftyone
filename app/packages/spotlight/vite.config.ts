import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command === "build") {
    return {
      esbuild: {},
      build: {
        lib: {
          entry: "src/index.ts",
          formats: ["es"],
        },
        target: "es2022",
        minify: false,
      },
      test: {},
    };
  }

  return {
    root: "examples",
  };
});
