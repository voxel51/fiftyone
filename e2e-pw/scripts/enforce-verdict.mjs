// Fails the e2e verdict job when the merged report contains failed specs,
// when any shard's blob report is missing (a crashed shard must not pass
// silently), or when no tests ran at all (a config error that exits before
// running tests would otherwise produce an empty green report).
//
// Usage: node scripts/enforce-verdict.mjs merged-results.json all-blob-reports
// Env: EXPECTED_SHARDS (number of shard blob reports that must be present)

import { readFileSync, readdirSync } from "node:fs";

const [, , jsonPath, blobDir] = process.argv;
if (!jsonPath || !blobDir) {
  console.error(
    "usage: node scripts/enforce-verdict.mjs <merged-results.json> <blob-dir>",
  );
  process.exit(1);
}

const failures = [];

// Shard jobs are report-only for spec failures, so a red shard means infra
// death — a timed-out or crashed shard produces partial blobs that must not
// merge into a green verdict.
const shardJobsResult = process.env.TEST_E2E_RESULT;
if (shardJobsResult && shardJobsResult !== "success") {
  failures.push(`shard jobs concluded '${shardJobsResult}'`);
}

const expectedShards = Number(process.env.EXPECTED_SHARDS ?? "0");
const blobs = readdirSync(blobDir).filter((f) => f.endsWith(".zip")).length;
if (expectedShards && blobs !== expectedShards) {
  failures.push(`expected ${expectedShards} shard reports, found ${blobs}`);
}

const stats = JSON.parse(readFileSync(jsonPath, "utf8")).stats ?? {};
const unexpected = stats.unexpected ?? null;
if (unexpected === null) {
  failures.push("merged report has no stats; cannot determine verdict");
} else if (unexpected > 0) {
  failures.push(`${unexpected} failed spec${unexpected === 1 ? "" : "s"}`);
}
if (
  (stats.expected ?? 0) + (stats.flaky ?? 0) + (stats.unexpected ?? 0) ===
  0
) {
  failures.push("no tests ran");
}
if ((stats.flaky ?? 0) > 0) {
  // flaky is reported (comment section + this annotation), not failed
  console.log(
    `::warning::${stats.flaky} flaky spec${
      stats.flaky === 1 ? "" : "s"
    } (passed on retry) — see the e2e comment`,
  );
}

if (failures.length) {
  console.error(`e2e verdict: FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log(
  `e2e verdict: pass (${stats.expected} passed, ${stats.flaky} flaky)`,
);
