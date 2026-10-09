/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Development timings of the grid's fill on the browser's performance
 * timeline (DevTools' Performance panel, or
 * `performance.getEntriesByType("measure")`), named `floodlight:*`. Nothing
 * is recorded in a production build, and nothing is logged.
 */

const enabled =
  Boolean(import.meta.env?.DEV) &&
  typeof performance !== "undefined" &&
  typeof performance.mark === "function";

/** Entries kept before the timeline's floodlight entries are cleared. */
export const MAX_MARKS = 500;

let count = 0;

const bound = () => {
  if (++count < MAX_MARKS) return;
  count = 0;
  for (const type of ["mark", "measure"] as const) {
    const names = new Set(
      performance
        .getEntriesByType(type)
        .map((entry) => entry.name)
        .filter((name) => name.startsWith("floodlight:")),
    );
    for (const name of names) {
      type === "mark"
        ? performance.clearMarks(name)
        : performance.clearMeasures(name);
    }
  }
};

/**
 * Starts a span named `floodlight:<name>`; each call of the returned
 * function measures from the start to now as `floodlight:<name>:<phase>`.
 */
export const span = (name: string): ((phase: string) => void) => {
  if (!enabled) return () => undefined;
  bound();
  const start = `floodlight:${name}:start:${count}`;
  performance.mark(start);
  return (phase) => {
    bound();
    try {
      performance.measure(`floodlight:${name}:${phase}`, start);
    } catch {
      // the start was cleared by the bound
    }
  };
};
