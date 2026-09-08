import { UserConfig } from "vite";

export default <UserConfig>{
  rollupOptions: {
    external: ["react", "react-dom"],
  },
  resolve: {
    alias: {
      "@fiftyone/video-annotation": "@fiftyone/video-annotation/index.ts",
    },
  },
};
