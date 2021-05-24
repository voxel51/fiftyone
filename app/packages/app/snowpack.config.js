/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  optimize: {
    bundle: true,
    minify: true,
    target: "es2020",
  },
  mount: {
    src: "/",
    public: "/",
    "../looker": "/@fiftyone/looker",
  },
  plugins: ["@snowpack/plugin-typescript", "@snowpack/plugin-react-refresh"],
  packageOptions: {
    polyfillNode: true,
  },
  devOptions: {
    hmrErrorOverlay: false,
    open: "none",
  },
  buildOptions: {
    baseUrl: "",
    clean: true,
    out: "../../fiftyone/server/static",
  },
  alias: {
    "@fiftyone/looker": "../looker",
  },
};
