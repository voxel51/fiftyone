// Shared by report-summary.mjs (initial authoritative comment) and
// refresh-suite-rows.mjs (post-run refresh): one table row per sibling
// suite in the run.
const IGNORE = new Set([
  "all-tests",
  "modified-files",
  "triage",
  "enterprise-sync",
  "e2e-comment-suites",
]);

export function buildSuiteRows(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const group = job.name.includes(" / ")
      ? job.name.split(" / ")[0]
      : job.name;
    if (IGNORE.has(group) || group === "e2e") {
      continue;
    }
    groups.set(group, [...(groups.get(group) ?? []), job]);
  }
  const icon = (js) =>
    js.some((j) => j.conclusion === "failure")
      ? "❌"
      : js.some((j) => j.status !== "completed")
        ? "⏳"
        : js.every((j) => j.conclusion === "skipped")
          ? "⊘ skipped"
          : js.some((j) => j.conclusion === "cancelled")
            ? "🚫 cancelled"
            : "✅";
  return [...groups.entries()]
    .sort()
    .map(([name, js]) => `| ${name} | ${icon(js)} |`);
}
