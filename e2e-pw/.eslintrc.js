/* eslint-disable */

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:playwright/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "playwright/expect-expect": "off",
    "playwright/no-networkidle": "off",
  },
  ignorePatterns: ["node_modules/", "scripts/"],
};
