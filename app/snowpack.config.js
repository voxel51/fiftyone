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
  exclude: [
    "**/node_modules/**/*",
    "**/*.@(spec|test|stories).@(ts|tsx)",
    "player51/",
  ],
  install: [
    /* ... */
  ],
  installOptions: {
    namedExports: ["recharts", "recharts-scale", "decimal.js-light"],
    polyfillNode: true,
  },
  devOptions: {
    hmrErrorOverlay: false,
  },
  buildOptions: {
    /* ... */
  },
  proxy: {
    /* ... */
  },
  alias: {
    /* ... */
  },
};
