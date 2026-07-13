// Renders the merged Playwright JSON report (playwright merge-reports
// --reporter json) as the markdown body for the authoritative e2e PR comment
// and the workflow job summary.
//
// Usage: node scripts/report-summary.mjs merged-results.json
// Env: RUN_URL (workflow run link), HEAD_SHA (commit the run tested)

import { readFileSync } from "node:fs";

// The synced copy of this suite runs in fiftyone-teams too; flavor-scoped
// markers and headings let the OSS and FOE comments coexist on the OSS PR.
const FLAVOR = (process.env.GITHUB_REPOSITORY ?? "").endsWith("fiftyone-teams")
  ? "FOE"
  : "OSS";
const MARKER = `<!-- e2e-authoritative-report:${FLAVOR} -->`;
const MAX_LISTED = 50;

const [, , jsonPath] = process.argv;
if (!jsonPath) {
  console.error("usage: node scripts/report-summary.mjs <merged-results.json>");
  process.exit(1);
}

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

const lines = [
  MARKER,
  failed.length
    ? `## ❌ e2e (${FLAVOR}): ${failed.length} failed spec${
        failed.length === 1 ? "" : "s"
      }`
    : `## ✅ e2e (${FLAVOR}) passed`,
  "",
  `**${failed.length} failed · ${flaky.length} flaky · ${
    stats.expected ?? 0
  } passed · ${stats.skipped ?? 0} skipped** at \`${sha}\`${runLink}`,
];

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
