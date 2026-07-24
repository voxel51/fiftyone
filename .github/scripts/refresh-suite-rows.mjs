// Keeps the authoritative CI comment truthful once every suite has
// concluded: rewrites the suite rows (suites like test-windows outlast the
// e2e verdict and would freeze at ⏳), settles the python section from the
// pytest-results artifacts, and — when the e2e pipeline never posted a
// comment (drafts, docs-only changes, stacked PRs) — builds a suites-only
// comment from scratch so every PR gets one.
//
// usage: node refresh-suite-rows.mjs <run-jobs.json> <comment-body.md|--new> [pytest-junit-dir]
// --new env: GITHUB_REPOSITORY (flavor), HEAD_SHA, RUN_URL
// Prints the refreshed (or fresh) body; an existing body without a suite
// table passes through unchanged.

import { readFileSync } from "node:fs";

import {
  PYTHON_FAILURES_END,
  PYTHON_FAILURES_START,
  PYTHON_LINE_MARKER,
  buildPythonFailures,
  buildPythonLine,
  collectResults,
  hasPythonJobs,
} from "./python-section.mjs";
import { buildSuiteRows, jobsIcon } from "./suite-rows.mjs";

const [, , jobsPath, bodyPath, junitDir] = process.argv;
if (!jobsPath || !bodyPath) {
  console.error(
    "usage: node refresh-suite-rows.mjs <run-jobs.json> <body.md|--new> [pytest-junit-dir]",
  );
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(jobsPath, "utf8")).jobs ?? [];
const rows = buildSuiteRows(jobs);
const e2eJobs = jobs.filter((j) => j.name.split(" / ")[0] === "e2e");
const e2eRan = e2eJobs.some((j) => j.conclusion !== "skipped");

// full comment built from the run's jobs alone — used when the e2e pipeline
// never posted its report: skipped entirely, or dead after the in-progress
// banner but before the verdict could write results
const buildFresh = () => {
  const flavor = (process.env.GITHUB_REPOSITORY ?? "").endsWith(
    "fiftyone-teams",
  )
    ? "FOE"
    : "OSS";
  const sha = (process.env.HEAD_SHA ?? "").slice(0, 10);
  const runUrl = process.env.RUN_URL ?? "";
  const allRows = [
    ...rows,
    ...(e2eRan ? [`| e2e | ${jobsIcon(e2eJobs)} |`] : []),
  ];
  const fresh = [
    `<!-- ci-report:${flavor} -->`,
    `## ${allRows.some((r) => r.includes("❌")) ? "❌" : "✅"} CI (${flavor})`,
    "",
    `Suite results at \`${sha}\`${runUrl ? ` — [run](${runUrl})` : ""}`,
  ];
  if (hasPythonJobs(jobs)) {
    fresh.push("", `**python**: ⏳ ${PYTHON_LINE_MARKER}`);
  }
  if (allRows.length) {
    fresh.push("", "| suite | result |", "| --- | --- |", ...allRows);
  } else {
    fresh.push("", "_No suites ran for this change._");
  }
  if (hasPythonJobs(jobs)) {
    fresh.push("", PYTHON_FAILURES_START, PYTHON_FAILURES_END);
  }
  if (!e2eRan) {
    fresh.push("", "_The e2e suite did not run for this revision._");
  }
  return fresh;
};

let lines;
if (bodyPath === "--new") {
  lines = buildFresh();
} else {
  const body = readFileSync(bodyPath, "utf8");
  lines = body.split("\n");
  const header = lines.indexOf("| suite | result |");
  const e2eRow = lines.findIndex((l) => l.startsWith("| e2e |"));
  // a body without a suite table is a stranded banner; a body with one but
  // no e2e jobs this run carries a previous revision's e2e results — both
  // rebuild from this run's jobs
  if (!e2eRan || header === -1 || e2eRow < header + 2) {
    lines = buildFresh();
  } else {
    lines.splice(header + 2, e2eRow - header - 2, ...rows);

    // The headline is posted by the e2e verdict, which only knows e2e; a
    // suite that failed after posting must flip it
    const headline = lines.findIndex((l) => l.startsWith("## "));
    if (headline !== -1 && rows.some((r) => r.includes("❌"))) {
      lines[headline] = lines[headline].replace(/^## [✅⚠️]+ CI/u, "## ❌ CI");
    }
  }
}

// settle the python placeholder: its own clock from the concluded matrix
// jobs, failed tests (with per-version timing) from the junit artifacts
const pythonLine = lines.findIndex((l) => l.includes(PYTHON_LINE_MARKER));
if (junitDir && pythonLine !== -1) {
  const results = collectResults(junitDir);
  lines[pythonLine] = buildPythonLine(jobs, results);
  const start = lines.indexOf(PYTHON_FAILURES_START);
  const end = lines.indexOf(PYTHON_FAILURES_END);
  if (start !== -1 && end > start) {
    const failures = buildPythonFailures(results);
    lines.splice(
      start + 1,
      end - start - 1,
      ...(failures.length ? ["", ...failures, ""] : []),
    );
  }
}

process.stdout.write(lines.join("\n"));
