const packages = [
  "plugins",
  "state",
  "aggregations",
  "utilities",
  "relay",
  "operators",
  "spaces",
];

/**
 * @type {import('typedoc').TypeDocOptions}
 */
module.exports = {
  name: "@fiftyone/fiftyone",
  entryPoints: packages.map((p) => `packages/${p}`),
  entryPointStrategy: "packages",
  exclude: ["**/node_modules/**", "**/test/**"],
  skipErrorChecking: true,
  tsconfig: "tsconfig.json",
  packageOptions: {
    skipErrorChecking: true,
  },
};
