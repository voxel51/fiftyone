/**
 * This is a prettier config at the root of the monorepo,
 * there's yet another prettier config inside `app` directory that extends this config for the webapp.
 */
module.exports = {
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
