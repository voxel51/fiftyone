const packages = [
  // 'plugins',
  "state",
];

/**
 * @type {import('typedoc').TypeDocOptions}
 */
module.exports = {
  entryPoints: packages.map((p) => `packages/${packages}/src/index.ts`),
  // entryPointStrategy: 'packages',
  exclude: ["**/node_modules/**", "**/test/**"],
  skipErrorChecking: true,
  tsconfig: "tsconfig.json",
};
