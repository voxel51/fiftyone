const eslint = require("@eslint/js");
const playwright = require("eslint-plugin-playwright");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ...eslint.configs.recommended, files: ["src/**/*.{ts,tsx}"] },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx}"],
  })),
  {
    ...playwright.configs["flat/recommended"],
    files: ["src/**/*.{ts,tsx}"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "playwright/expect-expect": "off",
      "playwright/no-wait-for-selector": "off",
      "playwright/no-force-option": "off",
    },
  },
  {
    // non-playwright-files (vitest)
    files: ["src/**/*.test.ts"],
    rules: {
      "playwright/no-standalone-expect": "off",
    },
  }
);
