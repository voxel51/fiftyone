import { describe, expect, it } from "vitest";

import {
  measureSpecSeconds,
  renderTimingDrift,
  timingDrift,
} from "./timing-drift.mjs";

const spec = (file, line, title, ...results) => ({
  file,
  line,
  title,
  tests: [{ results }],
});

const report = (...specs) => ({ suites: [{ specs }] });

describe("measureSpecSeconds", () => {
  it("sums each test's first attempt per file, ignoring retries", () => {
    const seconds = measureSpecSeconds(
      report(
        spec(
          "a.spec.ts",
          1,
          "one",
          { retry: 0, duration: 10_000 },
          { retry: 1, duration: 90_000 },
        ),
        spec("a.spec.ts", 9, "two", { retry: 0, duration: 5_000 }),
        spec("b.spec.ts", 1, "one", { retry: 0, duration: 2_000 }),
      ),
    );
    expect(seconds).toEqual({ "a.spec.ts": 15, "b.spec.ts": 2 });
  });

  it("averages a test's repeats instead of adding them", () => {
    const seconds = measureSpecSeconds(
      report(
        spec("a.spec.ts", 1, "one", { retry: 0, duration: 10_000 }),
        spec("a.spec.ts", 1, "one", { retry: 0, duration: 20_000 }),
        spec("a.spec.ts", 1, "one", { retry: 0, duration: 30_000 }),
      ),
    );
    expect(seconds).toEqual({ "a.spec.ts": 20 });
  });
});

describe("timingDrift", () => {
  const timings = { "a.spec.ts": 20, "b.spec.ts": 100, "gone.spec.ts": 30 };
  const existing = ["a.spec.ts", "b.spec.ts", "new.spec.ts"];

  it("lists missing, stale and drifted specs", () => {
    const drift = timingDrift(
      { "a.spec.ts": 50, "b.spec.ts": 120, "new.spec.ts": 7 },
      timings,
      existing,
    );
    expect(drift).toEqual({
      missing: ["new.spec.ts"],
      stale: ["gone.spec.ts"],
      drifted: [{ file: "a.spec.ts", expected: 20, actual: 50 }],
    });
  });

  it("ignores small absolute changes on short specs", () => {
    const drift = timingDrift({ "a.spec.ts": 34 }, timings, existing);
    expect(drift.drifted).toEqual([]);
  });

  it("renders nothing when the timings hold", () => {
    expect(renderTimingDrift({ missing: [], stale: [], drifted: [] })).toEqual(
      [],
    );
  });

  it("renders one collapsed warning listing every finding", () => {
    const lines = renderTimingDrift({
      missing: ["new.spec.ts"],
      stale: [],
      drifted: [{ file: "a.spec.ts", expected: 20, actual: 50 }],
    });
    expect(lines.join("\n")).toContain("Shard timings drifted (2)");
    expect(lines.join("\n")).toContain(
      "`a.spec.ts`: 20.0s in the timings, 50.0s this run",
    );
  });
});
