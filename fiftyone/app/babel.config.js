module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          electron: "6.0",
        },
      },
    ],
    "@babel/preset-react",
  ],
  plugins: [
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    ["@babel/plugin-proposal-class-properties", { loose: true }],
  ],
};
