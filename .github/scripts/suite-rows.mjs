// Shared by report-summary.mjs (initial authoritative comment) and
// refresh-suite-rows.mjs (post-run refresh): one table row per sibling
// suite in the run.
const IGNORE = new Set([
  "all-tests",
  "modified-files",
  "triage",
  "enterprise-sync",
  "ci-comment",
  // enterprise plumbing jobs, not suites; report-to-oss also runs after the
  // refresh job, so its row could never settle
  "report-to-oss",
  "oss-merged-check",
]);

export const jobsIcon = (js) =>
  js.some((j) => j.conclusion === "failure")
    ? "❌"
    : js.some((j) => j.status !== "completed")
      ? "⏳"
      : js.some((j) => j.conclusion === "cancelled")
        ? "🚫 cancelled"
        : "✅";

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
  const icon = jobsIcon;
  return [...groups.entries()]
    .sort()
    .filter(([, js]) => !js.every((j) => j.conclusion === "skipped"))
    .map(([name, js]) => `| ${name} | ${icon(js)} |`);
}
