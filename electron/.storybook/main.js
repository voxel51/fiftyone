module.exports = {
  stories: ["../app/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-actions/register",
    "@storybook/addon-backgrounds/register",
    "@storybook/addon-docs",
    "@storybook/addon-knobs/register",
    "@storybook/addon-links/register",
    "@storybook/addon-storysource",
    "@storybook/addon-viewport/register",
  ],
  webpackFinal: async (config) => {
    config.module.rules.push({
      test: /\.(ts|tsx)$/,
      loader: require.resolve("babel-loader"),
    });
    config.resolve.extensions.push(".ts", ".tsx");
    return config;
  },
};
