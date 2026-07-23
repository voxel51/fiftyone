// Rewrites the suite rows of an existing authoritative e2e comment with
// each suite's concluded state, and settles the python section from the
// pytest-results artifacts. The comment is posted when the e2e verdict
// completes, which often precedes slower siblings like test-windows and
// the python matrix, so their entries freeze at ⏳ without this refresh.
//
// usage: node refresh-suite-rows.mjs <run-jobs.json> <comment-body.md> [pytest-junit-dir]
// Prints the refreshed body (unchanged if the comment has no suite table).

import { readFileSync } from "node:fs";

import {
  PYTHON_FAILURES_END,
  PYTHON_FAILURES_START,
  PYTHON_LINE_MARKER,
  buildPythonFailures,
  buildPythonLine,
  collectResults,
} from "./python-section.mjs";
import { buildSuiteRows } from "./suite-rows.mjs";

const [, , jobsPath, bodyPath, junitDir] = process.argv;
if (!jobsPath || !bodyPath) {
  console.error(
    "usage: node refresh-suite-rows.mjs <run-jobs.json> <body.md> [pytest-junit-dir]",
  );
  process.exit(1);
}

const body = readFileSync(bodyPath, "utf8");
const lines = body.split("\n");
const header = lines.indexOf("| suite | result |");
const e2eRow = lines.findIndex((l) => l.startsWith("| e2e |"));
if (header === -1 || e2eRow < header + 2) {
  process.stdout.write(body);
  process.exit(0);
}

const jobs = JSON.parse(readFileSync(jobsPath, "utf8")).jobs ?? [];
const rows = buildSuiteRows(jobs);
lines.splice(header + 2, e2eRow - header - 2, ...rows);

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

// The headline is posted by the e2e verdict, which only knows e2e; a suite
// that failed after posting must flip it
const headline = lines.findIndex((l) => l.startsWith("## "));
if (headline !== -1 && rows.some((r) => r.includes("❌"))) {
  lines[headline] = lines[headline].replace(/^## [✅⚠️]+ CI/u, "## ❌ CI");
}
process.stdout.write(lines.join("\n"));
