// Python section of the authoritative CI comment. The pytest jobs upload
// junit XML as pytest-results-<version> artifacts; those usually conclude
// after the e2e verdict posts the comment, so report-summary.mjs emits a
// placeholder behind these markers and refresh-suite-rows.mjs settles it
// once every suite has finished.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { fmtMs, jobSpan } from "./job-span.mjs";

export const PYTHON_LINE_MARKER = "<!-- python-line -->";
export const PYTHON_FAILURES_START = "<!-- python-failures:start -->";
export const PYTHON_FAILURES_END = "<!-- python-failures:end -->";

export const PYTHON_JOB = /test-python/;
const MAX_LISTED = 50;

// junit <testcase> entries as {id, time, status}; a <failure>/<error> child
// fails the case, <skipped> skips it, self-closing passes
export const parseJunit = (xml) => {
  const cases = [];
  const testcase = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  const attr = (attrs, name) =>
    attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? "";
  for (const [, attrs, body = ""] of xml.matchAll(testcase)) {
    const classname = attr(attrs, "classname");
    const name = attr(attrs, "name");
    cases.push({
      id: classname ? `${classname}::${name}` : name,
      time: Math.round(Number(attr(attrs, "time") || "0") * 1000),
      status: /<(failure|error)\b/.test(body)
        ? "failed"
        : /<skipped\b/.test(body)
          ? "skipped"
          : "passed",
    });
  }
  return cases;
};

// junit-dir layout: <dir>/pytest-results-<version>/**.xml (one artifact per
// matrix leg) plus an optional artifact-urls.tsv (name<TAB>url) linking each
// leg's artifact; returns [{version, cases, url?}] sorted by version
export const collectResults = (junitDir) => {
  const results = [];
  let artifacts = [];
  try {
    artifacts = readdirSync(junitDir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith("pytest-results-"),
    );
  } catch {
    return results;
  }
  const urls = new Map();
  try {
    for (const row of readFileSync(join(junitDir, "artifact-urls.tsv"), "utf8")
      .split("\n")
      .filter(Boolean)) {
      const [name, url] = row.split("\t");
      urls.set(name, url);
    }
  } catch {
    // links are optional; the section renders without them
  }
  for (const artifact of artifacts) {
    const cases = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith(".xml")) {
          cases.push(...parseJunit(readFileSync(path, "utf8")));
        }
      }
    };
    walk(join(junitDir, artifact.name));
    results.push({
      version: artifact.name.replace("pytest-results-", ""),
      cases,
      url: urls.get(artifact.name),
    });
  }
  return results.sort((a, b) => a.version.localeCompare(b.version));
};

// distinct failing tests across matrix legs, each with per-version timing
// so a version-specific failure reads as such
const aggregateFailures = (results) => {
  const failedIds = new Set();
  for (const { cases } of results) {
    for (const c of cases) {
      if (c.status === "failed") {
        failedIds.add(c.id);
      }
    }
  }
  return [...failedIds].sort().map((id) => ({
    id,
    runs: results.flatMap(({ version, cases }) =>
      cases
        .filter((c) => c.id === id)
        .map((c) => ({ version, time: c.time, ok: c.status !== "failed" })),
    ),
  }));
};

export const buildPythonLine = (jobs, results) => {
  const span = jobSpan(jobs, PYTHON_JOB);
  const clock = span === null ? "" : ` · ⏱ ${fmtMs(span)}`;
  const pythonJobs = jobs.filter((j) => PYTHON_JOB.test(j.name));
  const unhealthy = pythonJobs.some((j) =>
    ["failure", "cancelled", "timed_out"].includes(j.conclusion),
  );
  if (!results.length) {
    return `**python**: ${
      unhealthy ? "❌ job failed with" : "✅"
    } no test report${clock} ${PYTHON_LINE_MARKER}`;
  }
  const failures = aggregateFailures(results);
  // legs run the same suite; the widest leg's counts stand in for all
  const passed = Math.max(
    ...results.map((r) => r.cases.filter((c) => c.status === "passed").length),
  );
  const skipped = Math.max(
    ...results.map((r) => r.cases.filter((c) => c.status === "skipped").length),
  );
  const counts = failures.length
    ? `❌ ${failures.length} failed · ${passed} passed`
    : `✅ ${passed} passed`;
  const links = results
    .filter((r) => r.url)
    .map((r) => `[${r.version}](${r.url})`)
    .join(" · ");
  return `**python**: ${counts} · ${skipped} skipped${clock}${
    links ? ` · junit: ${links}` : ""
  } ${PYTHON_LINE_MARKER}`;
};

export const buildPythonFailures = (results) => {
  const failures = aggregateFailures(results);
  if (!failures.length) {
    return [];
  }
  const lines = ["### Python failures"];
  for (const { id, runs } of failures.slice(0, MAX_LISTED)) {
    const timings = runs
      .map(
        (r) =>
          `${r.ok ? "✅" : "❌"} ${(r.time / 1000).toFixed(1)}s (${r.version})`,
      )
      .join(" · ");
    lines.push(`- \`${id}\` — ${timings}`);
  }
  if (failures.length > MAX_LISTED) {
    lines.push(`- …and ${failures.length - MAX_LISTED} more`);
  }
  return lines;
};

// true when the run has (non-skipped) python test jobs, so the comment
// should carry a python section at all
export const hasPythonJobs = (jobs) =>
  jobs.some(
    (j) => PYTHON_JOB.test(j.name) && j.conclusion !== "skipped",
  );
