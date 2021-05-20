/** @type {import('snowpack").SnowpackUserConfig } */
module.exports = {
  workspaceRoot: "../",
  plugins: ["@snowpack/plugin-typescript"],
  buildOptions: {
    out: "dist",
  },
};
