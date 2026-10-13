// Compares a run with e2e-pw/ci/spec-timings.json, the per-test seconds the
// shards are packed by, and reports only what drifted: tests that got much
// slower or faster, tests missing from or gone from the timings, and shards
// that ran much longer than the run's typical shard (a slower environment
// slows every shard alike, so shards compare with each other). A test counts its first attempt, averaged
// over the repeats Playwright reports as separate spec entries, so retries
// and repeat-each don't inflate it.

import { packShards } from "./shard-plan.mjs";

const TEST_RATIO = 2;
const TEST_MIN_SECONDS = 10;
const SHARD_RATIO = 1.25;
const SHARD_MIN_SECONDS = 120;

/** A test's key within its file: its describe titles and title */
const testKey = (trail, title) => [...trail, title].join(" › ");

/** `{ file: { test: seconds } }` from a merged Playwright JSON report */
export const measureTestSeconds = (report) => {
  const samples = {};
  const walk = (suite, trail, inFile) => {
    // the top-level suites are files; their title is the file path
    const next = inFile && suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const first = (test.results ?? []).find((r) => (r.retry ?? 0) === 0);
        if (!first) continue;
        const tests = (samples[spec.file] ??= {});
        (tests[testKey(next, spec.title)] ??= []).push(
          (first.duration ?? 0) / 1000,
        );
      }
    }
    for (const child of suite.suites ?? []) walk(child, next, true);
  };
  for (const suite of report.suites ?? []) walk(suite, [], false);

  const seconds = {};
  for (const [file, tests] of Object.entries(samples)) {
    seconds[file] = {};
    for (const [test, runs] of Object.entries(tests)) {
      seconds[file][test] = runs.reduce((a, b) => a + b, 0) / runs.length;
    }
  }
  return seconds;
};

const moved = (expected, actual, ratio, minSeconds) =>
  Math.abs(actual - expected) >= minSeconds &&
  (actual >= expected * ratio || actual <= expected / ratio);

/**
 * Drift between this run and the timings. A test counts as gone only when
 * its file ran, so a missing shard reads as incomplete, not as deletions.
 */
export const timingDrift = (measured, timings, specFiles, shards) => {
  const existing = new Set(specFiles);
  const added = [];
  const removed = [];
  const drifted = [];
  for (const [file, tests] of Object.entries(measured)) {
    const expectedTests = timings[file] ?? {};
    for (const [test, actual] of Object.entries(tests)) {
      const expected = expectedTests[test];
      if (expected === undefined) added.push({ file, test, actual });
      else if (moved(expected, actual, TEST_RATIO, TEST_MIN_SECONDS))
        drifted.push({ file, test, expected, actual });
    }
    for (const test of Object.keys(expectedTests)) {
      if (!(test in tests)) removed.push({ file, test });
    }
  }
  for (const file of Object.keys(timings)) {
    if (!existing.has(file)) removed.push({ file, test: null });
  }

  const slowShards = [];
  if (shards) {
    const ranShards = packShards(specFiles, timings, shards)
      .map((bin, i) => ({ shard: i + 1, files: bin.files }))
      .filter(({ files }) => files.every((file) => file in measured))
      .map(({ shard, files }) => ({
        shard,
        actual: files
          .map((file) =>
            Object.values(measured[file]).reduce((a, b) => a + b, 0),
          )
          .reduce((a, b) => a + b, 0),
      }));
    const sorted = ranShards.map((s) => s.actual).sort((a, b) => a - b);
    const typical = sorted[Math.floor((sorted.length - 1) / 2)];
    for (const { shard, actual } of ranShards) {
      if (
        actual - typical >= SHARD_MIN_SECONDS &&
        actual >= typical * SHARD_RATIO
      ) {
        slowShards.push({ shard, typical, actual });
      }
    }
  }

  const byKey = (a, b) =>
    a.file.localeCompare(b.file) || (a.test ?? "").localeCompare(b.test ?? "");
  return {
    added: added.sort(byKey),
    removed: removed.sort(byKey),
    drifted: drifted.sort(byKey),
    slowShards,
  };
};

/** The report's collapsed warning, or no lines when the timings hold */
export const renderTimingDrift = ({ added, removed, drifted, slowShards }) => {
  const count =
    added.length + removed.length + drifted.length + slowShards.length;
  if (!count) return [];
  const s = (n) => `${n.toFixed(1)}s`;
  const name = ({ file, test }) =>
    test ? `\`${file}\` › ${test}` : `\`${file}\``;
  return [
    "",
    "<details>",
    `<summary>⚠️ Test timings drifted (${count}): refresh <code>e2e-pw/ci/spec-timings.json</code></summary>`,
    "",
    ...slowShards.map(
      ({ shard, typical, actual }) =>
        `- shard ${shard}: ran ${s(actual)}, the typical shard ${s(typical)}`,
    ),
    ...drifted.map(
      (d) =>
        `- ${name(d)}: ${s(d.expected)} in the timings, ${s(d.actual)} this run`,
    ),
    ...added.map(
      (a) => `- ${name(a)}: new test, no timing yet (${s(a.actual)} this run)`,
    ),
    ...removed.map(
      (r) =>
        `- ${name(r)}: stale entry, the ${r.test ? "test" : "spec file"} no longer exists`,
    ),
    "",
    "</details>",
  ];
};
