const packages = ["plugins", "state", "aggregations", "utilities", "relay"];

/**
 * @type {import('typedoc').TypeDocOptions}
 */
module.exports = {
  entryPoints: packages.map((p) => `packages/${p}`),
  entryPointStrategy: "packages",
  exclude: ["**/node_modules/**", "**/test/**"],
  skipErrorChecking: true,
  tsconfig: "tsconfig.json",
};
