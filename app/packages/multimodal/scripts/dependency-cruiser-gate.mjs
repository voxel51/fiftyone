/** Exit decision for a dependency-cruiser JSON graph. */
export function dependencyCruiserGate(graph) {
  const summary = graph?.summary;
  if (!summary || typeof summary !== "object") {
    throw new TypeError("dependency-cruiser graph is missing a summary");
  }

  const error = violationCount(summary.error, "error");
  const warn = violationCount(summary.warn, "warn");
  return {
    error,
    exitCode: error + warn > 0 ? 1 : 0,
    warn,
  };
}

function violationCount(value, severity) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      `dependency-cruiser summary.${severity} must be a non-negative integer`,
    );
  }
  return value;
}
