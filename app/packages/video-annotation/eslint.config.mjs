import { fixupConfigRules } from "@eslint/compat";
import hooksPlugin from "eslint-plugin-react-hooks";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import pluginReactJSXRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", "**/*.config.*"] },
  { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  ...fixupConfigRules(pluginReactConfig),
  // Automatic JSX runtime (tsconfig `jsx: "react-jsx"`) — disables
  // react-in-jsx-scope / jsx-uses-react, which are false positives here.
  ...fixupConfigRules(pluginReactJSXRuntime),
  {
    files: ["**/*.{ts,tsx}"],
    settings: { react: { version: "detect" } },
    plugins: { "react-hooks": hooksPlugin },
    rules: {
      ...hooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/display-name": "off",
    },
  },
];
