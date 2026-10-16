// Rewrites e2e-pw/ci/spec-timings.json from a CI run's merged Playwright JSON
// report: each test's first-attempt seconds, averaged over repeats. Files the
// run didn't cover keep their entries while the spec still exists.
//
// Usage: node .github/scripts/refresh-spec-timings.mjs <merged-results.json>

import { readFileSync, writeFileSync } from "node:fs";

import { TIMINGS_PATH, listSpecFiles, readTimings } from "./shard-plan.mjs";
import { measureTestSeconds } from "./timing-drift.mjs";

const [, , reportPath] = process.argv;
if (!reportPath) {
  console.error(
    "usage: node .github/scripts/refresh-spec-timings.mjs <merged-results.json>",
  );
  process.exit(1);
}

export const refreshTimings = (measured, previous, specFiles) => {
  const existing = new Set(specFiles);
  const next = {};
  for (const file of [
    ...new Set([...Object.keys(measured), ...Object.keys(previous)]),
  ].sort()) {
    if (!existing.has(file)) continue;
    const tests = measured[file] ?? previous[file];
    next[file] = Object.fromEntries(
      Object.keys(tests)
        .sort()
        .map((test) => [test, Math.round(tests[test] * 10) / 10]),
    );
  }
  return next;
};

const measured = measureTestSeconds(
  JSON.parse(readFileSync(reportPath, "utf8")),
);
const previous = (() => {
  try {
    return readTimings();
  } catch {
    return {};
  }
})();
const next = refreshTimings(measured, previous, listSpecFiles());
writeFileSync(TIMINGS_PATH, `${JSON.stringify(next, null, 4)}\n`);
const tests = Object.values(next).reduce(
  (n, t) => n + Object.keys(t).length,
  0,
);
console.log(`${Object.keys(next).length} spec files, ${tests} tests`);
