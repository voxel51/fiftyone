const rootPrettier = require("../.prettierrc.js");

module.exports = {
  ...rootPrettier,
  trailingComma: "es5",
  tabWidth: 2,
  semi: true,
  useTabs: false,
  singleQuote: false,
  printWidth: 80,
};
