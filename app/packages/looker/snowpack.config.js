/** @type {import('snowpack").SnowpackUserConfig } */
module.exports = {
  workspaceRoot: "../../",
  plugins: ["@snowpack/plugin-react-refresh", "@snowpack/plugin-typescript"],
  packageOptions: {
    external: ["react"],
  },
};
