import { UserConfig } from "vite";

export default <UserConfig>{
  rollupOptions: {
    external: ["react", "react-dom"],
  },
  resolve: {
    alias: {
      "@fiftyone/playback": "@fiftyone/playback/index.ts",
    },
  },
};
