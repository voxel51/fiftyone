/**
 * Error-count ratchet: fails CI if TypeScript errors or ESLint warnings exceed
 * the ceilings committed in app/error-baseline.json.
 *
 *   node ./scripts/check-baselines.mjs            # gate
 *   node ./scripts/check-baselines.mjs --update   # rewrite the ceilings
 *
 * packages/multimodal is excluded from both counts: it is strict-authored,
 * already gated by its own stricter `yarn workspace @fiftyone/multimodal check`,
 * and the loose aggregate typecheck mis-grades strict code (phantom errors).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = `${appRoot}error-baseline.json`;
const yarn = process.platform === "win32" ? "yarn.cmd" : "yarn";

// Packages excluded from both counts (they run their own stricter checks in CI)
const EXCLUDED_PACKAGES = ["packages/multimodal"];

// tsc/eslint exit non-zero when they find problems; the report is on stdout.
const run = (...args) => {
  try {
    return execFileSync(yarn, ["exec", ...args], {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
};

console.log("Counting TypeScript errors…");
const typescript = run(
  "tsc",
  "--noEmit",
  "-p",
  "tsconfig.check.json",
  "--pretty",
  "false",
)
  .split("\n")
  .filter(
    (line) =>
      /error TS\d+/.test(line) &&
      !EXCLUDED_PACKAGES.some((pkg) => line.startsWith(`${pkg}/`)),
  ).length;

console.log("Counting ESLint warnings…");
// Hard errors are unexpected under the root config's only-warn plugin, but a
// new parse/config error should trip the gate too, so count both.
const eslint = JSON.parse(
  run(
    "eslint",
    "packages",
    "--ext",
    ".ts,.tsx",
    "--format",
    "json",
    ...EXCLUDED_PACKAGES.flatMap((pkg) => ["--ignore-pattern", `${pkg}/**`]),
  ),
).reduce((n, file) => n + file.warningCount + file.errorCount, 0);

const counts = { typescript, eslint };
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

if (process.argv.includes("--update")) {
  // 4-space indent to satisfy the repo prettier config's *.json override
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ ...baseline, ...counts }, null, 4)}\n`,
  );
  console.log(`Baseline updated: typescript=${typescript}, eslint=${eslint}`);
  process.exit(0);
}

let failed = false;
for (const [tool, actual] of Object.entries(counts)) {
  const ceiling = baseline[tool];
  if (typeof ceiling === "number" && actual <= ceiling) {
    console.log(`${tool}: OK (${actual}/${ceiling})`);
  } else {
    console.error(
      typeof ceiling === "number"
        ? `${tool}: ${actual} exceeds the baseline of ${ceiling} (+${actual - ceiling}). ` +
            `Fix the new problems, or run \`yarn baseline:update\` if the increase is intentional.`
        : `${tool}: no baseline — run \`yarn baseline:update\` and commit error-baseline.json.`,
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
