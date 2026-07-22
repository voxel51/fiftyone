// Fails the e2e verdict job when the merged report contains failed specs,
// when any shard's blob report is missing (a crashed shard must not pass
// silently), when no tests ran at all (a config error that exits before
// running tests would otherwise produce an empty green report), or when the
// burn-in of new/modified specs did not pass every repeat.
//
// Usage: node scripts/enforce-verdict.mjs merged-results.json all-blob-reports [burn-in-results.json]
// Env: EXPECTED_SHARDS (number of shard blob reports that must be present),
// BURN_IN_COUNT (spec files the burn-in job was asked to run; 0/empty = no
// burn-in this run), BURN_IN_RESULT (burn-in job conclusion)

import { readFileSync, readdirSync } from "node:fs";

const [, , jsonPath, blobDir, burnInJsonPath] = process.argv;
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

// Burn-in is report-only like the shards; enforce its outcome here. Fail
// closed: when specs were selected, anything short of a clean 10/10 across
// all of them — including a dead job or a missing report — is a red verdict.
const burnInCount = Number(process.env.BURN_IN_COUNT || "0");
if (burnInCount > 0) {
  const burnInResult = process.env.BURN_IN_RESULT ?? "";
  if (burnInResult !== "success") {
    failures.push(`burn-in job concluded '${burnInResult}'`);
  }
  let burnInStats = null;
  try {
    burnInStats = JSON.parse(readFileSync(burnInJsonPath, "utf8")).stats ?? {};
  } catch {
    failures.push(
      `burn-in report missing for ${burnInCount} new/modified spec file${
        burnInCount === 1 ? "" : "s"
      }`,
    );
  }
  if (burnInStats) {
    const burnInFailed = burnInStats.unexpected ?? 0;
    if (burnInFailed > 0) {
      failures.push(
        `${burnInFailed} failed burn-in run${
          burnInFailed === 1 ? "" : "s"
        } — new/modified specs must pass all 10 repeats`,
      );
    }
    if ((burnInStats.expected ?? 0) + burnInFailed === 0) {
      failures.push("burn-in ran no tests");
    }
  }
}

if (failures.length) {
  console.error(`e2e verdict: FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log(
  `e2e verdict: pass (${stats.expected} passed, ${stats.flaky} flaky${
    burnInCount > 0 ? `, burn-in ${burnInCount} spec file(s) clean` : ""
  })`,
);
