module.exports = {
  stories: ["../app/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-actions",
    "@storybook/addon-backgrounds",
    "@storybook/addon-docs",
    "@storybook/addon-knobs",
    "@storybook/addon-links",
    "@storybook/addon-storysource",
    "@storybook/addon-viewport",
  ],
  webpackFinal: async (config) => {
    const webpack = require("webpack");
    config.module.rules.push({
      test: /\.(ts|tsx)$/,
      loader: require.resolve("babel-loader"),
    });
    config.resolve.extensions.push(".ts", ".tsx");
    config.plugins.push(new webpack.IgnorePlugin(/^electron$/));
    return config;
  },
};
