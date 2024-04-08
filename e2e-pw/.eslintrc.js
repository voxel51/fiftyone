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
    // todo: this is giving false positives, enable when fixed
    "playwright/no-standalone-expect": "off",
  },
  ignorePatterns: ["node_modules/", "scripts/"],
};
