module.exports = {
  trailingComma: "es5",
  tabWidth: 2,
  semi: true,
  useTabs: false,
  singleQuote: false,
  printWidth: 80,
  overrides: [
    {
      files: "*.md",
      options: {
        printWidth: 79,
        proseWrap: "always",
        tabWidth: 4,
      },
    },
    {
      files: "*.json",
      options: {
        tabWidth: 4,
      },
    },
  ],
};
