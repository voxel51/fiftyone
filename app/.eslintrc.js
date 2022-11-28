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
    "plugin:prettier/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
    JSX: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // project: "tsconfig.json",
    // tsconfigRootDir: __dirname,
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint", "prettier", "react-hooks"],
  rules: {
    "valid-jsdoc": "off",
    "require-jsdoc": "off",
    "prettier/prettier": "error",
    "no-debugger": "warn",
    "no-invalid-this": 0,
    "spaced-comment": [
      "error",
      "always",
      {
        markers: ["/"],
      },
    ],
    // must disable base rule for typescript no-unused-vars to take effect
    "no-unused-vars": "off",
    // allow unused vars that have the underscore prefix
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-empty-function": "warn",
    "@typescript-eslint/no-empty-interface": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [],
};
