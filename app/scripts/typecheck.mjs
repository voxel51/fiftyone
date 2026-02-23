#!/usr/bin/env node
/**
 * Runs `tsc --noEmit -p tsconfig.typecheck.json` and filters output to only
 * show errors from packages listed in the tsconfig's "include" array.
 *
 * This isolates type errors to the packages you're actively working on,
 * ignoring errors from transitive dependencies that get pulled in during
 * compilation but aren't your current focus.
 *
 * To add more packages: edit the "include" array in tsconfig.typecheck.json.
 */

import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Use `tsc --showConfig` to get the resolved config as clean JSON (handles JSONC comments)
const configJson = execSync(
  "node_modules/.bin/tsc -p tsconfig.typecheck.json --showConfig",
  { cwd: root, encoding: "utf8" }
);
const tsconfig = JSON.parse(configJson);

// Derive prefix patterns from the "include" globs (take the leading path segment)
const includePaths = (tsconfig.include ?? []).map((glob) => {
  // e.g. "packages/utilities/src/**/*" → "packages/utilities/"
  const parts = glob.split("/");
  return parts.slice(0, 3).join("/") + "/";
});

if (includePaths.length === 0) {
  console.error("No entries in tsconfig.typecheck.json include array.");
  process.exit(1);
}

const tscResult = spawnSync(
  "node_modules/.bin/tsc",
  ["--noEmit", "-p", "tsconfig.typecheck.json"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
);
const output = tscResult.stdout ?? "";
const exitCode = tscResult.status ?? 0;

// tsc error lines start with a file path, e.g.:
//   packages/utilities/src/foo.ts(12,5): error TS2345: ...
// Continuation/context lines are indented.
// Global tsc errors (config problems, missing files) have no file prefix, e.g.:
//   error TS18003: No inputs were found in config file ...
const lines = output.split("\n");
const filtered = [];
const globalErrors = [];
let capturing = false;

for (const line of lines) {
  const isErrorLine = includePaths.some((p) => line.startsWith(p));
  const isGlobalError = /^error TS\d+:/.test(line);
  const isContinuation = line.startsWith(" ") || line.startsWith("\t");

  if (isErrorLine) {
    capturing = true;
    filtered.push(line);
  } else if (isGlobalError) {
    capturing = false;
    globalErrors.push(line);
  } else if (capturing && isContinuation) {
    filtered.push(line);
  } else {
    capturing = false;
  }
}

const result = filtered.join("\n").trim();

if (globalErrors.length > 0) {
  // tsc configuration or infrastructure error — always fatal
  console.error(globalErrors.join("\n"));
  process.exit(exitCode || 1);
} else if (result) {
  console.error(result);
  console.error(
    `\nShowing errors from: ${includePaths.join(", ")}\n` +
      `(transitive errors from other packages are hidden — fix these first, then expand "include" in tsconfig.typecheck.json)`
  );
  process.exit(exitCode);
} else if (exitCode !== 0) {
  console.log(
    `✓ No errors in: ${includePaths.join(", ")}\n` +
      `  (transitive packages have errors, but they're not in scope yet)`
  );
} else {
  console.log(`✓ No type errors in: ${includePaths.join(", ")}`);
}
