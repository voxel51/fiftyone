import { createRequire } from "node:module";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { ESLint } = require("eslint");
const { typeAwareRules } = require("./type-aware-eslint-ratchet.cjs");

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

const eslint = new ESLint({
  cwd: appRoot,
  useEslintrc: false,
  overrideConfigFile: `${packageRoot}/.eslintrc.js`,
  overrideConfig: {
    ignorePatterns: ["packages/multimodal/src/**/__generated__/**"],
    parserOptions: {
      project: `${packageRoot}/tsconfig.json`,
      tsconfigRootDir: packageRoot,
    },
    rules: typeAwareRules,
  },
});

const results = await eslint.lintFiles([
  "packages/multimodal/src/**/*.{ts,tsx}",
]);
const census = new Map();
const directoryTotals = new Map();
const areaTotals = new Map();
const ruleTotals = new Map();
let total = 0;

for (const result of results) {
  const relativePath = relative(packageRoot, result.filePath);
  const sourcePath = relativePath.replace(/^src\//, "");
  const slash = sourcePath.indexOf("/");
  const directory = slash === -1 ? "(root)" : sourcePath.slice(0, slash);
  const remainder = slash === -1 ? "" : sourcePath.slice(slash + 1);
  const secondSlash = remainder.indexOf("/");
  const area =
    slash === -1
      ? "(root)"
      : `${directory}/${
          secondSlash === -1 ? "(root)" : remainder.slice(0, secondSlash)
        }`;

  for (const message of result.messages) {
    if (!message.ruleId || !(message.ruleId in typeAwareRules)) continue;

    total += 1;
    const key = `${message.ruleId}\t${directory}`;
    census.set(key, (census.get(key) ?? 0) + 1);
    directoryTotals.set(directory, (directoryTotals.get(directory) ?? 0) + 1);
    areaTotals.set(area, (areaTotals.get(area) ?? 0) + 1);
    ruleTotals.set(message.ruleId, (ruleTotals.get(message.ruleId) ?? 0) + 1);
  }
}

console.log("BY RULE");
for (const [rule, count] of [...ruleTotals].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(`${rule}\t${count}`);
}
console.log("\nBY TOP-LEVEL SOURCE DIRECTORY");
for (const [directory, count] of [...directoryTotals].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(`${directory}\t${count}`);
}
console.log("\nBY RULE AND TOP-LEVEL SOURCE DIRECTORY");
for (const [key, count] of [...census].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${key}\t${count}`);
}
console.log("\nBY SECOND-LEVEL SOURCE AREA");
for (const [area, count] of [...areaTotals].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(`${area}\t${count}`);
}
console.log(`\nTOTAL\t${total}`);
