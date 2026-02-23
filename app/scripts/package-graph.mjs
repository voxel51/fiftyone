#!/usr/bin/env node
/**
 * Generates a Mermaid flowchart of @fiftyone/* inter-package dependencies
 * and opens it in the Mermaid Live Editor.
 *
 * Dependencies are derived from actual source imports (*.ts, *.tsx), not
 * package.json declarations, so the graph reflects what tsc actually compiles.
 */

import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = resolve(__dirname, "../packages");

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Read each package's name from package.json
const dirToShort = new Map(); // dir basename → short name (e.g. "utilities")
for (const dir of packageDirs) {
  try {
    const pkg = JSON.parse(
      readFileSync(join(packagesDir, dir, "package.json"), "utf8")
    );
    if (pkg.name?.startsWith("@fiftyone/")) {
      dirToShort.set(dir, pkg.name.replace("@fiftyone/", ""));
    }
  } catch {
    /* skip */
  }
}

// Scan TypeScript source files in a directory tree and collect @fiftyone/* imports
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
      for (const match of content.matchAll(
        /from\s+["'](@fiftyone\/[^/"']+)/g
      )) {
        found.add(match[1]);
      }
    }
  }
  return found;
}

// Build edges from source-level imports
const edges = []; // [from, to]
const allNodes = new Set();

for (const [dir, short] of dirToShort) {
  allNodes.add(short);
  const imports = collectImports(join(packagesDir, dir));
  for (const imp of imports) {
    const depShort = imp.replace("@fiftyone/", "");
    if (depShort === short) continue; // skip self-imports
    allNodes.add(depShort);
    edges.push([short, depShort]);
  }
}

// Deduplicate edges (multiple files in a package may import the same dep)
const uniqueEdges = [...new Map(edges.map((e) => [e.join("->"), e])).values()];

// Assign Mermaid-safe node IDs (hyphens are not valid in unquoted IDs)
const nodeId = (name) => name.replace(/-/g, "_");

// Node declaration: use sanitized ID with original name as label when they differ
const nodeDef = (name) => {
  const id = nodeId(name);
  return id === name ? id : `${id}["${name}"]`;
};

const lines = ["flowchart TD"];

// Declare all nodes with labels upfront (sorted for stable output)
for (const node of [...allNodes].sort()) {
  lines.push(`    ${nodeDef(node)}`);
}

lines.push("");

// Emit edges
for (const [from, to] of uniqueEdges) {
  lines.push(`    ${nodeId(from)} --> ${nodeId(to)}`);
}

const diagram = lines.join("\n");

if (process.argv.includes("--write")) {
  process.stdout.write(diagram + "\n");
} else {
  const payload = Buffer.from(
    JSON.stringify({ code: diagram, mermaid: { theme: "default" } })
  ).toString("base64");

  const url = `https://mermaid.live/edit#base64:${payload}`;

  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";

  execSync(`${opener} "${url}"`);
}
