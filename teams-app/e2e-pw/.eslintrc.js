/* eslint-disable */

module.exports = {
  extends: ["plugin:playwright/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "playwright/expect-expect": "off",
  },
};
