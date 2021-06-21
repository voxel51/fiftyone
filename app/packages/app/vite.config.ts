import reactRefresh from "@vitejs/plugin-react-refresh";

export default {
  plugins: [
    reactRefresh({
      parserPlugins: ["classProperties", "classPrivateProperties"],
    }),
  ],
  define: {
    "process.env": process.env,
  },
};
