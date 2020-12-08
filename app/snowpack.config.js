/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  experiments: {
    optimize: {
      bundle: true,
      minify: true,
      target: "es2018",
    },
  },
  mount: {
    src: "/_dist_",
    public: "/",
  },
  plugins: [
    "@snowpack/plugin-react-refresh",
    "@snowpack/plugin-dotenv",
    [
      "snowpack-plugin-replace",
      {
        list: [
          {
            from: "process.env",
            to: "import.meta.env",
          },
        ],
      },
    ],
  ],
  exclude: ["**/*.@(test|stories).@(ts|tsx)", "src/player51/**/*"],
  installOptions: {
    polyfillNode: true,
  },
  devOptions: {
    hmrErrorOverlay: false,
    open: "none",
  },
  buildOptions: {
    baseUrl: "",
    clean: true,
    out: "../fiftyone/server/static",
  },
  proxy: {
    /* ... */
  },
  alias: {
    /* ... */
  },
};
