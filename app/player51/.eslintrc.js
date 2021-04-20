module.exports = {
  root: true,
  env: {
    browser: true,
    es6: true,
  },
  extends: "google",
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  rules: {},
};
