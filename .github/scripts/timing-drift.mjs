// Compares a run's per-spec-file durations with e2e-pw/ci/spec-timings.json,
// which pack-shards.mjs uses to balance the shards. Retries and repeats would
// inflate a file's time, so a test counts its first attempt only, averaged
// over the repeats Playwright reports as separate spec entries.

const DEFAULT_RATIO = 0.5;
const DEFAULT_MIN_SECONDS = 15;

/** Seconds per spec file: each test's mean first-attempt duration, summed */
export const measureSpecSeconds = (report) => {
  const byTest = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const first = (test.results ?? []).find((r) => (r.retry ?? 0) === 0);
        if (!first) continue;
        const key = `${spec.file}\u0000${spec.line}\u0000${spec.title}`;
        const entry = byTest.get(key) ?? { file: spec.file, durations: [] };
        entry.durations.push((first.duration ?? 0) / 1000);
        byTest.set(key, entry);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);

  const seconds = {};
  for (const { file, durations } of byTest.values()) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    seconds[file] = (seconds[file] ?? 0) + mean;
  }
  return seconds;
};

/**
 * Specs the timings file is missing, entries for spec files that no longer
 * exist, and specs whose measured time moved by more than `ratio` of their
 * entry and at least `minSeconds`
 */
export const timingDrift = (
  measured,
  timings,
  existingFiles,
  { ratio = DEFAULT_RATIO, minSeconds = DEFAULT_MIN_SECONDS } = {},
) => {
  const existing = new Set(existingFiles);
  const missing = Object.keys(measured)
    .filter((file) => !(file in timings))
    .sort();
  const stale = Object.keys(timings)
    .filter((file) => !existing.has(file))
    .sort();
  const drifted = Object.entries(measured)
    .filter(([file]) => file in timings)
    .map(([file, actual]) => ({ file, expected: timings[file], actual }))
    .filter(
      ({ expected, actual }) =>
        Math.abs(actual - expected) >= Math.max(minSeconds, expected * ratio),
    )
    .sort((a, b) => a.file.localeCompare(b.file));
  return { missing, stale, drifted };
};

/** The report's collapsed warning, or no lines when the timings hold */
export const renderTimingDrift = ({ missing, stale, drifted }) => {
  const count = missing.length + stale.length + drifted.length;
  if (!count) return [];
  const s = (n) => n.toFixed(1);
  return [
    "",
    "<details>",
    `<summary>⚠️ Shard timings drifted (${count}): refresh <code>e2e-pw/ci/spec-timings.json</code></summary>`,
    "",
    ...missing.map(
      (file) =>
        `- \`${file}\`: not in the timings (packed at the default weight)`,
    ),
    ...stale.map(
      (file) => `- \`${file}\`: in the timings, but the spec no longer exists`,
    ),
    ...drifted.map(
      ({ file, expected, actual }) =>
        `- \`${file}\`: ${s(expected)}s in the timings, ${s(actual)}s this run`,
    ),
    "",
    "</details>",
  ];
};
