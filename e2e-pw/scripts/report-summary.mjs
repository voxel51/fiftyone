// Renders the merged Playwright JSON report (playwright merge-reports
// --reporter json) as the markdown body for the authoritative e2e PR comment
// and the workflow job summary.
//
// Usage: node scripts/report-summary.mjs merged-results.json [blob-dir] [jobs-json] [burn-in-json]
// Env: RUN_URL (workflow run link), HEAD_SHA (commit the run tested),
// TEST_E2E_RESULT (shard jobs' aggregate result), EXPECTED_SHARDS
// (shard count; with blob-dir, flags runs whose reports are incomplete),
// RUN_STARTED_AT (attempt start, for the wall-clock line), REPORT_URL
// (merged HTML report artifact download link), BURN_IN_COUNT (spec files
// selected for burn-in; 0/empty = none this run), BURN_IN_RESULT (burn-in
// job conclusion)

import { readFileSync, readdirSync } from "node:fs";

import { fmtMs, jobSpan } from "./job-span.mjs";
import {
  PYTHON_FAILURES_END,
  PYTHON_FAILURES_START,
  PYTHON_LINE_MARKER,
  hasPythonJobs,
} from "./python-section.mjs";
import { buildSuiteRows } from "./suite-rows.mjs";

// The synced copy of this suite runs in fiftyone-teams too; flavor-scoped
// markers and headings let the OSS and FOE comments coexist on the OSS PR.
const FLAVOR = (process.env.GITHUB_REPOSITORY ?? "").endsWith("fiftyone-teams")
  ? "FOE"
  : "OSS";
const MARKER = `<!-- e2e-authoritative-report:${FLAVOR} -->`;
const MAX_LISTED = 50;

const [, , jsonPath, blobDir, jobsPath, burnInJsonPath] = process.argv;
if (!jsonPath) {
  console.error(
    "usage: node scripts/report-summary.mjs <merged-results.json> [blob-dir]",
  );
  process.exit(1);
}

// A shard killed by timeout or a lost runner leaves partial or missing blob
// reports; the merged counts silently understate the suite, so say so.
const shardResult = process.env.TEST_E2E_RESULT ?? "";
const expectedShards = Number(process.env.EXPECTED_SHARDS ?? "0");
const foundBlobs = blobDir
  ? readdirSync(blobDir).filter((f) => f.endsWith(".zip")).length
  : null;
const incomplete =
  (shardResult !== "" && shardResult !== "success") ||
  (expectedShards > 0 && foundBlobs !== null && foundBlobs !== expectedShards);

const report = JSON.parse(readFileSync(jsonPath, "utf8"));

const failed = [];
const flaky = [];

const walk = (suite, trail) => {
  const path = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    const statuses = (spec.tests ?? []).map((t) => t.status);
    // one result per attempt, so retries surface with their own clock
    const attempts = (spec.tests ?? [])
      .flatMap((t) => t.results ?? [])
      .map(
        (r) =>
          `${r.status === "passed" ? "✅" : "❌"} ${((r.duration ?? 0) / 1000).toFixed(1)}s`,
      )
      .join(", ");
    const entry = {
      location: `${spec.file}:${spec.line}`,
      title: [...path.slice(1), spec.title].join(" › "),
      attempts,
    };
    if (statuses.includes("unexpected")) {
      failed.push(entry);
    } else if (statuses.includes("flaky")) {
      flaky.push(entry);
    }
  }
  for (const child of suite.suites ?? []) {
    walk(child, path);
  }
};

for (const suite of report.suites ?? []) {
  walk(suite, []);
}

const byLocation = (a, b) => a.location.localeCompare(b.location);
failed.sort(byLocation);
flaky.sort(byLocation);

// Burn-in: new/modified spec files repeated 10x with retries disabled in
// their own job; its report merges separately so repeats don't inflate the
// suite counts above.
const burnInCount = Number(process.env.BURN_IN_COUNT || "0");
const burnInResult = process.env.BURN_IN_RESULT ?? "";
const burnInFailed = [];
let burnInStats = null;
if (burnInCount > 0 && burnInJsonPath) {
  try {
    const burnInReport = JSON.parse(readFileSync(burnInJsonPath, "utf8"));
    burnInStats = burnInReport.stats ?? {};
    // each repeat-each run arrives as its own spec entry in the merged
    // JSON, so aggregate runs per test before reporting failed-N-of-M
    const byTest = new Map();
    const walkBurnIn = (suite, trail) => {
      const path = suite.title ? [...trail, suite.title] : trail;
      for (const spec of suite.specs ?? []) {
        const key = `${spec.file}:${spec.line} › ${spec.title}`;
        const entry = byTest.get(key) ?? {
          location: `${spec.file}:${spec.line}`,
          name: [...path.slice(1), spec.title].join(" › "),
          failed: 0,
          runs: [],
        };
        for (const test of spec.tests ?? []) {
          const ok = test.status !== "unexpected";
          const ms = (test.results ?? []).reduce(
            (sum, result) => sum + (result.duration ?? 0),
            0,
          );
          entry.runs.push({ ok, ms });
          if (!ok) {
            entry.failed++;
          }
        }
        byTest.set(key, entry);
      }
      for (const child of suite.suites ?? []) {
        walkBurnIn(child, path);
      }
    };
    for (const suite of burnInReport.suites ?? []) {
      walkBurnIn(suite, []);
    }
    for (const entry of byTest.values()) {
      if (entry.failed > 0) {
        burnInFailed.push({
          location: entry.location,
          title: `${entry.name} — failed ${entry.failed}/${entry.runs.length} runs`,
          runs: entry.runs,
        });
      }
    }
    burnInFailed.sort(byLocation);
  } catch {
    // missing report: burnInStats stays null and the run reads as unhealthy
  }
}
const burnInUnhealthy =
  burnInCount > 0 &&
  (burnInResult !== "success" ||
    burnInStats === null ||
    burnInFailed.length > 0 ||
    (burnInStats.expected ?? 0) + (burnInStats.unexpected ?? 0) === 0);

const itemize = (entries) => {
  const lines = entries
    .slice(0, MAX_LISTED)
    .map(
      (e) =>
        `- \`${e.location}\` ${e.title}${e.attempts ? ` — ${e.attempts}` : ""}`,
    );
  if (entries.length > MAX_LISTED) {
    lines.push(`- …and ${entries.length - MAX_LISTED} more`);
  }
  return lines;
};

const stats = report.stats ?? {};
const sha = (process.env.HEAD_SHA ?? "").slice(0, 10);
const runUrl = process.env.RUN_URL ?? "";
const runLink = runUrl ? ` — [run](${runUrl})` : "";

let jobs = [];
if (jobsPath) {
  try {
    jobs = JSON.parse(readFileSync(jobsPath, "utf8")).jobs ?? [];
  } catch {
    // jobs are informational; the e2e verdict never depends on them
  }
}

// each suite line carries its own clock: e2e is the shard jobs' span,
// burn-in and python run in parallel with their own, so none inflates
// another
const shardSpan = jobSpan(jobs, /Run e2e shard/);
const burnInSpan = jobSpan(jobs, /Burn in new/);
let wallClock = shardSpan === null ? "" : ` · ⏱ ${fmtMs(shardSpan)}`;
if (!wallClock) {
  const startedAt = Date.parse(process.env.RUN_STARTED_AT ?? "");
  if (!Number.isNaN(startedAt)) {
    wallClock = ` · ⏱ pipeline ${fmtMs(Date.now() - startedAt)}`;
  }
}

// one row per sibling suite in the run (build, lint, unit tests, ...)
const suiteRows = buildSuiteRows(jobs);

const headline = failed.length
  ? `## ❌ CI (${FLAVOR}): ${failed.length} failed spec${
      failed.length === 1 ? "" : "s"
    }`
  : burnInUnhealthy
    ? `## ❌ CI (${FLAVOR}): e2e burn-in failed`
    : incomplete
      ? `## ⚠️ CI (${FLAVOR}): incomplete e2e run`
      : `## ✅ CI (${FLAVOR})`;

const lines = [MARKER, headline];
if (incomplete) {
  const parts = [];
  if (shardResult !== "" && shardResult !== "success") {
    parts.push(`shard jobs concluded '${shardResult}'`);
  }
  if (foundBlobs !== null && expectedShards > 0) {
    parts.push(`merged ${foundBlobs}/${expectedShards} shard reports`);
  }
  lines.push(`> ⚠️ Incomplete: ${parts.join("; ")} — specs may be missing.`);
}
lines.push(
  "",
  `**e2e**: ${failed.length} failed · ${flaky.length} flaky · ${
    stats.expected ?? 0
  } passed · ${stats.skipped ?? 0} skipped${wallClock} at \`${sha}\`${runLink}`,
);
if (burnInCount > 0) {
  lines.push(
    "",
    `**burn-in** (${burnInCount} new/modified target${
      burnInCount === 1 ? "" : "s"
    } × 10 runs, no retries): ${burnInUnhealthy ? "❌" : "✅"}${
      burnInSpan === null ? "" : ` · ⏱ ${fmtMs(burnInSpan)}`
    }`,
  );
}
// the python matrix usually outlasts the e2e verdict; post a placeholder
// and let the suite-refresh job settle it from the pytest-results artifacts
if (hasPythonJobs(jobs)) {
  lines.push("", `**python**: ⏳ ${PYTHON_LINE_MARKER}`);
}
if (suiteRows.length) {
  lines.push(
    "",
    "| suite | result |",
    "| --- | --- |",
    ...suiteRows,
    `| e2e | ${failed.length ? "❌" : incomplete ? "⚠️" : "✅"} |`,
    ...(burnInCount > 0
      ? [`| e2e burn-in | ${burnInUnhealthy ? "❌" : "✅"} |`]
      : []),
  );
}

if (failed.length) {
  lines.push("", "### Failed specs", ...itemize(failed));
}
if (flaky.length) {
  lines.push("", "### Flaky (passed on retry)", ...itemize(flaky));
}
if (burnInUnhealthy) {
  lines.push("", "### Burn-in failures");
  if (burnInFailed.length) {
    for (const entry of burnInFailed.slice(0, MAX_LISTED)) {
      lines.push(
        "<details>",
        `<summary><code>${entry.location}</code> ${entry.title}</summary>`,
        "",
        ...entry.runs.map(
          (run, i) =>
            `- run ${i + 1}: ${run.ok ? "✅" : "❌"} ${(run.ms / 1000).toFixed(1)}s`,
        ),
        "",
        "</details>",
      );
    }
    if (burnInFailed.length > MAX_LISTED) {
      lines.push(`…and ${burnInFailed.length - MAX_LISTED} more`);
    }
  } else {
    // the job died or produced no report; the verdict names the cause
    lines.push(
      `- burn-in job concluded '${burnInResult}' with no usable report`,
    );
  }
  lines.push(
    "",
    "New and modified tests must pass 10 consecutive runs. Reproduce with" +
      " `cd e2e-pw && yarn e2e <file:line> --repeat-each=10 --retries=0`.",
  );
}
if (hasPythonJobs(jobs)) {
  lines.push("", PYTHON_FAILURES_START, PYTHON_FAILURES_END);
}
const reportUrl = process.env.REPORT_URL ?? "";
lines.push(
  "",
  reportUrl
    ? `Full HTML report: [playwright-report-merged](${reportUrl})`
    : "Full HTML report: `playwright-report-merged` artifact on the run page.",
);

console.log(lines.join("\n"));
