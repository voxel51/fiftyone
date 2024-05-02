import eslint from "@eslint/js";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

export default tseslint.config(
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
