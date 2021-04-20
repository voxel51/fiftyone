module.exports = {
  optimize: {
    bundle: true,
    minify: true,
    target: "es2018",
  },
  mount: {
    src: "/_dist_",
    public: "/",
  },
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
    out: "./build",
  },
};
