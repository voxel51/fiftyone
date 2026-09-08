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
  js.some((j) =>
    ["failure", "timed_out", "action_required"].includes(j.conclusion),
  )
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

// The headline is posted by the e2e verdict, which only knows e2e. A suite
// that failed after posting must flip it to ❌; a rerun that turned every
// row green again must lift that ❌ — but only the exact plain form
// `## ❌ CI (FLAVOR)`, which can only be a previous downgrade by this
// function: the verdict's ❌ always carries a `: reason` suffix and stays
// authoritative for e2e failures.
export function settleHeadline(lines, rows) {
  const headline = lines.findIndex((l) => l.startsWith("## "));
  if (headline === -1) {
    return;
  }
  const e2eRowLine = lines.find((l) => l.startsWith("| e2e |")) ?? "";
  if (rows.some((r) => r.includes("❌"))) {
    lines[headline] = lines[headline].replace(/^## [✅⚠️]+ CI/u, "## ❌ CI");
  } else if (
    !e2eRowLine.includes("❌") &&
    /^## ❌ CI \([A-Z]+\)\s*$/u.test(lines[headline])
  ) {
    lines[headline] = lines[headline].replace("## ❌ CI", "## ✅ CI");
  }
}
