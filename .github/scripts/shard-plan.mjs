// How CI splits the e2e specs into shards: greedy bin-packing by each spec
// file's expected seconds, the sum of its tests' entries in
// e2e-pw/ci/spec-timings.json. Shared by pack-shards.mjs and the CI report.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Seconds a spec file with no timings is packed at */
export const DEFAULT_WEIGHT = 20;

export const SPEC_ROOT = fileURLToPath(
  new URL("../../e2e-pw/src", import.meta.url),
);
export const TIMINGS_PATH = fileURLToPath(
  new URL("../../e2e-pw/ci/spec-timings.json", import.meta.url),
);

/** Spec files under e2e-pw/src, relative to it */
export const listSpecFiles = (root = SPEC_ROOT) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".spec.ts"))
        files.push(relative(root, path));
    }
  };
  walk(root);
  return files;
};

/** `{ file: { test: seconds } }` from e2e-pw/ci/spec-timings.json */
export const readTimings = (path = TIMINGS_PATH) =>
  JSON.parse(readFileSync(path, "utf8"));

/** A spec file's expected seconds: its tests' entries summed */
export const fileWeight = (timings, file) => {
  const tests = timings[file];
  if (!tests) return DEFAULT_WEIGHT;
  return Object.values(tests).reduce((a, b) => a + b, 0);
};

/** The spec files of each of `total` shards, heaviest first into the lightest */
export const packShards = (files, timings, total) => {
  const weighted = files
    .map((file) => [file, fileWeight(timings, file)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bins = Array.from({ length: total }, () => ({ weight: 0, files: [] }));
  for (const [file, weight] of weighted) {
    const bin = bins.reduce((min, b) => (b.weight < min.weight ? b : min));
    bin.weight += weight;
    bin.files.push(file);
  }
  return bins;
};
