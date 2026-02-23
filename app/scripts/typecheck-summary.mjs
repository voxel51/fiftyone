#!/usr/bin/env node
/**
 * Runs `tsc --noEmit -p tsconfig.typecheck.json` and prints a summary of
 * error counts grouped by package, sorted from most to fewest errors.
 * Useful for prioritizing which packages to fix next.
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const tscResult = spawnSync(
  "node_modules/.bin/tsc",
  ["--noEmit", "-p", "tsconfig.typecheck.json"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
);

const output = tscResult.stdout ?? "";
const counts = {};

for (const line of output.split("\n")) {
  const match = line.match(/^(packages\/[^/]+)/);
  if (match) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
}

const total = Object.values(counts).reduce((s, n) => s + n, 0);

if (total === 0) {
  console.log("No type errors found.");
  process.exit(0);
}

const width = String(total).length;
const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

for (const [pkg, count] of entries) {
  console.log(`${String(count).padStart(width)}  ${pkg}`);
}
console.log(`${"-".repeat(width + 2 + 30)}`);
console.log(`${String(total).padStart(width)}  total`);
