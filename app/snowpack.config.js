/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    public: "/",
    src: "/_dist_",
  },
  plugins: [
    "@snowpack/plugin-react-refresh",
    "@snowpack/plugin-dotenv",
    "snowpack-plugin-mdx",
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
  exclude: ["**/*.@(test|stories).@(ts|tsx)", "player51/"],
  install: [
    /* ... */
  ],
  installOptions: {
    polyfillNode: true,
    rollup: {
      plugins: [require("rollup-plugin-pnp-resolve")()],
    },
  },
  devOptions: {
    hmrErrorOverlay: false,
    open: "none",
  },
  buildOptions: {
    out: "../fiftyone/server/static",
  },
  proxy: {
    /* ... */
  },
  alias: {
    /* ... */
  },
};
