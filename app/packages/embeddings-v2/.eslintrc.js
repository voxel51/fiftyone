module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  globals: {
    JSX: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint", "prettier", "react-hooks"],
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_|React",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    // an empty catch is self-explanatory best-effort; a comment inside it
    // would only restate that
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
