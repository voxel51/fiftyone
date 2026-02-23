#!/usr/bin/env node
/**
 * Reports progress on the incremental type-checking project:
 *   1. Lists packages currently free of type errors (🎉)
 *   2. Loudly warns if any zero-error package is missing from tsconfig.typecheck.json's
 *      include list (it should be a CI gate)
 *   3. Prints a fix sequence: leaf packages first (fewest → most errors),
 *      then non-leaf packages (fewest → most errors)
 *
 * Everything is computed from scratch on each run.
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const packagesDir = join(root, "packages");

// ─── 1. Collect all packages ────────────────────────────────────────────────

const allPackages = new Map(); // short name → { dir, hasSrcDir }

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pkgJsonPath = join(packagesDir, entry.name, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (!pkg.name?.startsWith("@fiftyone/")) continue;
    const short = pkg.name.replace("@fiftyone/", "");
    const hasSrcDir = existsSync(join(packagesDir, entry.name, "src"));
    allPackages.set(short, { dir: entry.name, hasSrcDir });
  } catch {
    /* skip */
  }
}

// ─── 2. Build source-level dependency graph ──────────────────────────────────

function collectImports(dir) {
  const found = new Set();
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const dep of collectImports(full)) found.add(dep);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const content = readFileSync(full, "utf8");
      for (const m of content.matchAll(/from\s+["'](@fiftyone\/[^/"']+)/g)) {
        found.add(m[1].replace("@fiftyone/", ""));
      }
    }
  }
  return found;
}

const outgoing = new Map(); // short → Set<short> (packages this one imports)

for (const [short, { dir }] of allPackages) {
  const imports = new Set(
    [...collectImports(join(packagesDir, dir))].filter(
      (dep) => dep !== short && allPackages.has(dep)
    )
  );
  outgoing.set(short, imports);
}

const isLeaf = (short) => outgoing.get(short).size === 0;

// ─── 3. Determine which packages are in the tsc compilation scope ────────────

// --listFilesOnly exits 0 and prints the file list without type-checking
const listResult = spawnSync(
  "node_modules/.bin/tsc",
  ["-p", "tsconfig.typecheck.json", "--listFilesOnly"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
);

const compiledPackages = new Set();
for (const line of (listResult.stdout ?? "").split("\n")) {
  const rel = line.trim().replace(root + "/", "");
  const m = rel.match(/^packages\/([^/]+)\//);
  if (m && allPackages.has(m[1].replace(/-/g, "-"))) {
    // dir name → short name
    for (const [short, { dir }] of allPackages) {
      if (dir === m[1]) {
        compiledPackages.add(short);
        break;
      }
    }
  }
}

// ─── 4. Run tsc and collect error counts per package ─────────────────────────

const tscResult = spawnSync(
  "node_modules/.bin/tsc",
  ["--noEmit", "-p", "tsconfig.typecheck.json"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
);

const errorCounts = new Map(); // short → number

for (const line of (tscResult.stdout ?? "").split("\n")) {
  const m = line.match(/^packages\/([^/]+)\//);
  if (!m) continue;
  for (const [short, { dir }] of allPackages) {
    if (dir === m[1]) {
      errorCounts.set(short, (errorCounts.get(short) ?? 0) + 1);
      break;
    }
  }
}

// ─── 5. Read tsconfig.typecheck.json include patterns ────────────────────────

const configJson = execSync(
  "node_modules/.bin/tsc -p tsconfig.typecheck.json --showConfig",
  { cwd: root, encoding: "utf8" }
);
const tsconfig = JSON.parse(configJson);

// Which packages are explicitly covered by an include pattern?
const explicitlyIncluded = new Set();
for (const [short, { dir }] of allPackages) {
  const prefix = `packages/${dir}/`;
  if ((tsconfig.include ?? []).some((glob) => glob.startsWith(prefix))) {
    explicitlyIncluded.add(short);
  }
}

// The include pattern to recommend for a given package
function includePattern(short) {
  const { dir, hasSrcDir } = allPackages.get(short);
  return hasSrcDir ? `"packages/${dir}/src/**/*"` : `"packages/${dir}/**/*"`;
}

// ─── 6. Classify packages ────────────────────────────────────────────────────

// Compiled + 0 errors → clean. Not compiled → unchecked.
const clean = [];
const unchecked = [];

for (const [short] of allPackages) {
  const errors = errorCounts.get(short) ?? 0;
  if (errors > 0) continue; // has errors — not clean
  if (compiledPackages.has(short)) {
    clean.push(short);
  } else {
    unchecked.push(short);
  }
}

clean.sort();
unchecked.sort();

const cleanNotIncluded = clean.filter((s) => !explicitlyIncluded.has(s));

// Packages still needing fixes — split into leaves and non-leaves
const withErrors = [...errorCounts.entries()].filter(([, n]) => n > 0);
const leafErrors = withErrors
  .filter(([s]) => isLeaf(s))
  .sort((a, b) => a[1] - b[1]);
const nonLeafErrors = withErrors
  .filter(([s]) => !isLeaf(s))
  .sort((a, b) => a[1] - b[1]);

// ─── 7. Output ───────────────────────────────────────────────────────────────

const total = [...errorCounts.values()].reduce((s, n) => s + n, 0);
const w = String(total).length;
const pad = (n) => String(n).padStart(w);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Type-check progress report");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// ── Section 1: Clean packages ─────────────────────────────────────────────────
if (clean.length === 0) {
  console.log("No packages are fully clean yet.\n");
} else {
  console.log(
    `🎉  ${clean.length} package${
      clean.length > 1 ? "s" : ""
    } with zero type errors:\n`
  );
  for (const s of clean) {
    const tag = explicitlyIncluded.has(s) ? " ✅ in CI" : " ⬜ not in CI gate";
    console.log(`    ${s}${tag}`);
  }
  console.log();
}

// ── Section 2: Unchecked packages ─────────────────────────────────────────────
if (unchecked.length > 0) {
  console.log(
    `⬜  ${unchecked.length} package${
      unchecked.length > 1 ? "s" : ""
    } not yet reachable from the current typecheck scope:`
  );
  for (const s of unchecked) {
    console.log(`    ${s}`);
  }
  console.log();
}

// ── Section 3: Loud warning for clean-but-not-included ────────────────────────
if (cleanNotIncluded.length > 0) {
  console.log("🚨  ════════════════════════════════════════════════════════");
  console.log("🚨  ACTION REQUIRED — Add clean packages to the CI gate!");
  console.log("🚨  ════════════════════════════════════════════════════════");
  console.log("🚨");
  console.log(
    `🚨  The following ${cleanNotIncluded.length} package${
      cleanNotIncluded.length > 1 ? "s have" : " has"
    } zero type errors`
  );
  console.log(
    `🚨  but ${
      cleanNotIncluded.length > 1 ? "are" : "is"
    } NOT in the "include" list of tsconfig.typecheck.json.`
  );
  console.log("🚨  This means regressions will NOT be caught by CI.");
  console.log("🚨");
  console.log("🚨  Open app/tsconfig.typecheck.json and add the following");
  console.log('🚨  line(s) to the "include" array:');
  console.log("🚨");
  for (const s of cleanNotIncluded) {
    console.log(`🚨      ${includePattern(s)}`);
  }
  console.log("🚨");
  console.log("🚨  ════════════════════════════════════════════════════════\n");
}

// ── Section 4: Fix sequence ───────────────────────────────────────────────────
if (withErrors.length === 0) {
  console.log("🏆  All packages are error-free!\n");
} else {
  console.log(
    `📋  Fix sequence  (${total} errors remaining across ${withErrors.length} packages)\n`
  );

  if (leafErrors.length > 0) {
    console.log(
      "  Step 1 — Leaf packages (no @fiftyone imports, can be fixed in isolation):\n"
    );
    for (const [s, n] of leafErrors) {
      console.log(`    ${pad(n)} errors  —  ${s}`);
    }
    console.log();
  }

  if (nonLeafErrors.length > 0) {
    console.log(
      "  Step 2 — Non-leaf packages (fix after leaves; ordered fewest → most):\n"
    );
    for (const [s, n] of nonLeafErrors) {
      console.log(`    ${pad(n)} errors  —  ${s}`);
    }
    console.log();
  }
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
