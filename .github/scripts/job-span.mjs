// Wall-clock helpers over the run's jobs JSON (actions/runs/:id/jobs).
// Shared by report-summary.mjs and refresh-suite-rows.mjs so each suite
// line carries its own clock.

export const fmtMs = (ms) => {
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

// first start -> last finish across the jobs matching pattern; null until
// every matched job finishes
export const jobSpan = (jobs, pattern) => {
  const matched = jobs.filter((job) => pattern.test(job.name));
  if (!matched.length || matched.some((job) => !job.completed_at)) {
    return null;
  }
  const started = Math.min(...matched.map((j) => Date.parse(j.started_at)));
  const completed = Math.max(...matched.map((j) => Date.parse(j.completed_at)));
  return Number.isNaN(started) || Number.isNaN(completed)
    ? null
    : completed - started;
};
