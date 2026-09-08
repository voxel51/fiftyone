// Prints the spec files for one CI shard, greedy bin-packed by duration so
// no shard is bottlenecked by the heavy spec families. Weights come from
// ci/spec-timings.json (seconds per spec file, refreshed from a CI run's
// merged report); unknown files get a default weight.
//
// Usage: node scripts/pack-shards.mjs <shard> <total>

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WEIGHT = 20;

const [, , shardArg, totalArg] = process.argv;
const shard = Number(shardArg);
const total = Number(totalArg);
if (!shard || !total || shard < 1 || shard > total) {
  console.error("usage: node scripts/pack-shards.mjs <shard> <total>");
  process.exit(1);
}

const timings = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../e2e-pw/ci/spec-timings.json", import.meta.url)),
    "utf8",
  ),
);

const root = fileURLToPath(new URL("../../e2e-pw/src", import.meta.url));
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (entry.name.endsWith(".spec.ts")) {
      files.push(relative(root, path));
    }
  }
};
walk(root);

const weighted = files
  .map((file) => [file, timings[file] ?? DEFAULT_WEIGHT])
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const bins = Array.from({ length: total }, () => ({ weight: 0, files: [] }));
for (const [file, weight] of weighted) {
  const bin = bins.reduce((min, b) => (b.weight < min.weight ? b : min));
  bin.weight += weight;
  bin.files.push(file);
}

console.log(bins[shard - 1].files.map((f) => join("src", f)).join("\n"));
