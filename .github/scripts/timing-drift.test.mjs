import { describe, expect, it } from "vitest";

import { fileWeight, packShards } from "./shard-plan.mjs";
import {
  measureTestSeconds,
  renderTimingDrift,
  timingDrift,
} from "./timing-drift.mjs";

const spec = (file, line, title, ...results) => ({
  file,
  line,
  title,
  tests: [{ results }],
});

// a merged report: one top-level suite per file, describes nested inside
const report = (file, describe, ...specs) => ({
  suites: [{ title: file, suites: [{ title: describe, specs }] }],
});

describe("measureTestSeconds", () => {
  it("keys each test by its describe titles and counts its first attempt", () => {
    const seconds = measureTestSeconds(
      report(
        "a.spec.ts",
        "grid",
        spec(
          "a.spec.ts",
          1,
          "loads",
          { retry: 0, duration: 10_000 },
          { retry: 1, duration: 90_000 },
        ),
      ),
    );
    expect(seconds).toEqual({ "a.spec.ts": { "grid › loads": 10 } });
  });

  it("averages a test's repeats instead of adding them", () => {
    const seconds = measureTestSeconds(
      report(
        "a.spec.ts",
        "grid",
        spec("a.spec.ts", 1, "loads", { retry: 0, duration: 10_000 }),
        spec("a.spec.ts", 1, "loads", { retry: 0, duration: 20_000 }),
        spec("a.spec.ts", 1, "loads", { retry: 0, duration: 30_000 }),
      ),
    );
    expect(seconds).toEqual({ "a.spec.ts": { "grid › loads": 20 } });
  });
});

describe("packShards", () => {
  it("weighs a file by its tests and fills the lightest shard", () => {
    const timings = { "a.spec.ts": { x: 30, y: 30 }, "b.spec.ts": { x: 40 } };
    expect(fileWeight(timings, "a.spec.ts")).toBe(60);
    const bins = packShards(
      ["a.spec.ts", "b.spec.ts", "c.spec.ts"],
      timings,
      2,
    );
    expect(bins.map((b) => b.files)).toEqual([
      ["a.spec.ts"],
      ["b.spec.ts", "c.spec.ts"],
    ]);
  });
});

describe("timingDrift", () => {
  const timings = {
    "a.spec.ts": { slow: 10, same: 30, gone: 5 },
    "deleted.spec.ts": { x: 3 },
    "unrun.spec.ts": { x: 3 },
  };
  const specFiles = ["a.spec.ts", "unrun.spec.ts"];

  it("reports only drifted, added and removed tests", () => {
    const drift = timingDrift(
      { "a.spec.ts": { slow: 25, same: 34, fresh: 4 } },
      timings,
      specFiles,
    );
    expect(drift).toEqual({
      added: [{ file: "a.spec.ts", test: "fresh", actual: 4 }],
      removed: [
        { file: "a.spec.ts", test: "gone" },
        { file: "deleted.spec.ts", test: null },
      ],
      drifted: [{ file: "a.spec.ts", test: "slow", expected: 10, actual: 25 }],
      slowShards: [],
    });
  });

  it("flags a shard that ran far longer than it was packed at", () => {
    const drift = timingDrift(
      {
        "a.spec.ts": { slow: 300, same: 30, gone: 5 },
        "unrun.spec.ts": { x: 3 },
      },
      timings,
      specFiles,
      1,
    );
    expect(drift.slowShards).toEqual([{ shard: 1, expected: 48, actual: 338 }]);
  });

  it("renders nothing when the timings hold", () => {
    expect(
      renderTimingDrift({
        added: [],
        removed: [],
        drifted: [],
        slowShards: [],
      }),
    ).toEqual([]);
  });

  it("renders one collapsed warning listing every finding", () => {
    const text = renderTimingDrift({
      added: [],
      removed: [],
      drifted: [{ file: "a.spec.ts", test: "slow", expected: 10, actual: 25 }],
      slowShards: [{ shard: 4, expected: 600, actual: 2100 }],
    }).join("\n");
    expect(text).toContain("Test timings drifted (2)");
    expect(text).toContain("- shard 4: packed at 600.0s, ran 2100.0s");
    expect(text).toContain(
      "`a.spec.ts` › slow: 10.0s in the timings, 25.0s this run",
    );
  });
});
