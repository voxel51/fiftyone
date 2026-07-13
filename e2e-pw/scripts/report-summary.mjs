// Renders the merged Playwright JSON report (playwright merge-reports
// --reporter json) as the markdown body for the authoritative e2e PR comment
// and the workflow job summary.
//
// Usage: node scripts/report-summary.mjs merged-results.json [blob-dir]
// Env: RUN_URL (workflow run link), HEAD_SHA (commit the run tested),
// TEST_E2E_RESULT (shard jobs' aggregate result), EXPECTED_SHARDS
// (shard count; with blob-dir, flags runs whose reports are incomplete)

import { readFileSync, readdirSync } from "node:fs";

// The synced copy of this suite runs in fiftyone-teams too; flavor-scoped
// markers and headings let the OSS and FOE comments coexist on the OSS PR.
const FLAVOR = (process.env.GITHUB_REPOSITORY ?? "").endsWith("fiftyone-teams")
  ? "FOE"
  : "OSS";
const MARKER = `<!-- e2e-authoritative-report:${FLAVOR} -->`;
const MAX_LISTED = 50;

const [, , jsonPath, blobDir] = process.argv;
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
    const entry = {
      location: `${spec.file}:${spec.line}`,
      title: [...path.slice(1), spec.title].join(" › "),
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

const itemize = (entries) => {
  const lines = entries
    .slice(0, MAX_LISTED)
    .map((e) => `- \`${e.location}\` ${e.title}`);
  if (entries.length > MAX_LISTED) {
    lines.push(`- …and ${entries.length - MAX_LISTED} more`);
  }
  return lines;
};

const stats = report.stats ?? {};
const sha = (process.env.HEAD_SHA ?? "").slice(0, 10);
const runUrl = process.env.RUN_URL ?? "";
const runLink = runUrl ? ` — [run](${runUrl})` : "";

const headline = failed.length
  ? `## ❌ e2e (${FLAVOR}): ${failed.length} failed spec${
      failed.length === 1 ? "" : "s"
    }`
  : incomplete
    ? `## ⚠️ e2e (${FLAVOR}): incomplete run`
    : `## ✅ e2e (${FLAVOR}) passed`;

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
  `**${failed.length} failed · ${flaky.length} flaky · ${
    stats.expected ?? 0
  } passed · ${stats.skipped ?? 0} skipped** at \`${sha}\`${runLink}`,
);

if (failed.length) {
  lines.push("", "### Failed specs", ...itemize(failed));
}
if (flaky.length) {
  lines.push("", "### Flaky (passed on retry)", ...itemize(flaky));
}
lines.push(
  "",
  "Full HTML report: `playwright-report-merged` artifact on the run page.",
);

console.log(lines.join("\n"));
