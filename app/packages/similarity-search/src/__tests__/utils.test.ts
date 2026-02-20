import { describe, it, expect } from "vitest";
import {
  formatQuery,
  formatTime,
  pluralizeRuns,
  getDateRange,
  matchesText,
  matchesDate,
  canSubmitSearch,
  buildExecutionParams,
} from "../utils";
import { SimilarityRun } from "../types";
import { DAY_MS } from "../constants";

function makeRun(overrides: Partial<SimilarityRun> = {}): SimilarityRun {
  return {
    run_id: "r1",
    run_name: "Test Run",
    status: "completed",
    brain_key: "clip",
    query_type: "text",
    query: "a dog",
    reverse: false,
    result_count: 10,
    ...overrides,
  };
}

describe("formatQuery", () => {
  it("returns short text queries as-is", () => {
    const run = makeRun({ query_type: "text", query: "a dog" });
    expect(formatQuery(run)).toBe("a dog");
  });

  it("truncates text queries longer than 50 chars", () => {
    const longQuery = "a".repeat(60);
    const run = makeRun({ query_type: "text", query: longQuery });
    expect(formatQuery(run)).toBe("a".repeat(50) + "...");
  });

  it("formats image query with sample count", () => {
    const run = makeRun({
      query_type: "image",
      query: ["id1", "id2", "id3"],
    });
    expect(formatQuery(run)).toBe("Image similarity (3 samples)");
  });

  it("uses singular 'sample' for one image", () => {
    const run = makeRun({
      query_type: "image",
      query: ["id1"],
    });
    expect(formatQuery(run)).toBe("Image similarity (1 sample)");
  });

  it("includes negative count for image queries", () => {
    const run = makeRun({
      query_type: "image",
      query: ["id1", "id2"],
      negative_query_ids: ["neg1"],
    });
    expect(formatQuery(run)).toBe(
      "Image similarity (2 samples) \u00B7 1 negative"
    );
  });

  it("handles image query with no query array", () => {
    const run = makeRun({
      query_type: "image",
      query: undefined,
    });
    expect(formatQuery(run)).toBe("Image similarity (0 samples)");
  });

  it("falls back to query_type for unknown types", () => {
    const run = makeRun({ query_type: "text", query: undefined });
    expect(formatQuery(run)).toBe("text");
  });
});

describe("formatTime", () => {
  it("returns empty string for undefined", () => {
    expect(formatTime(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatTime("")).toBe("");
  });

  it("returns a non-empty string for valid ISO date", () => {
    const result = formatTime("2024-06-15T10:30:00Z");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns the original string for invalid dates", () => {
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });
});

describe("pluralizeRuns", () => {
  it("returns singular for 1", () => {
    expect(pluralizeRuns(1)).toBe("1 run");
  });

  it("returns plural for 0", () => {
    expect(pluralizeRuns(0)).toBe("0 runs");
  });

  it("returns plural for many", () => {
    expect(pluralizeRuns(5)).toBe("5 runs");
  });
});

describe("getDateRange", () => {
  it("returns null range for 'all'", () => {
    const { start, end } = getDateRange("all");
    expect(start).toBeNull();
    expect(end).toBeNull();
  });

  it("returns start of today for 'today'", () => {
    const { start, end } = getDateRange("today");
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeNull();
    // Start should be at midnight today
    expect(start!.getHours()).toBe(0);
    expect(start!.getMinutes()).toBe(0);
  });

  it("returns 7 days ago for 'last_7_days'", () => {
    const { start, end } = getDateRange("last_7_days");
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeNull();
    const now = new Date();
    const diff = now.getTime() - start!.getTime();
    // Should be roughly 7 days (within a day tolerance for test timing)
    expect(diff).toBeGreaterThanOrEqual(7 * DAY_MS - DAY_MS);
    expect(diff).toBeLessThanOrEqual(8 * DAY_MS);
  });

  it("returns 30 days ago for 'last_30_days'", () => {
    const { start, end } = getDateRange("last_30_days");
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeNull();
  });

  it("returns end date for 'older_than_30_days'", () => {
    const { start, end } = getDateRange("older_than_30_days");
    expect(start).toBeNull();
    expect(end).toBeInstanceOf(Date);
  });
});

describe("matchesText", () => {
  it("matches run_name case-insensitively", () => {
    const run = makeRun({ run_name: "My Dog Search" });
    expect(matchesText(run, "dog")).toBe(true);
    expect(matchesText(run, "DOG")).toBe(true);
  });

  it("matches query string", () => {
    const run = makeRun({ query: "find cats" });
    expect(matchesText(run, "cats")).toBe(true);
  });

  it("matches brain_key", () => {
    const run = makeRun({ brain_key: "clip_vit" });
    expect(matchesText(run, "clip")).toBe(true);
  });

  it("does not match unrelated text", () => {
    const run = makeRun({
      run_name: "Search 1",
      query: "dogs",
      brain_key: "clip",
    });
    expect(matchesText(run, "xyz")).toBe(false);
  });

  it("skips query matching for non-string queries", () => {
    const run = makeRun({ query: ["id1", "id2"] as any });
    expect(matchesText(run, "id1")).toBe(false);
  });
});

describe("matchesDate", () => {
  it("returns true when no date constraints", () => {
    const run = makeRun();
    expect(matchesDate(run, null, null)).toBe(true);
  });

  it("returns false when run has no creation_time", () => {
    const run = makeRun({ creation_time: undefined });
    expect(matchesDate(run, new Date(), null)).toBe(false);
  });

  it("filters by start date", () => {
    const run = makeRun({ creation_time: "2024-01-15T00:00:00Z" });
    expect(matchesDate(run, new Date("2024-01-01"), null)).toBe(true);
    expect(matchesDate(run, new Date("2024-02-01"), null)).toBe(false);
  });

  it("filters by end date", () => {
    const run = makeRun({ creation_time: "2024-01-15T00:00:00Z" });
    expect(matchesDate(run, null, new Date("2024-02-01"))).toBe(true);
    expect(matchesDate(run, null, new Date("2024-01-01"))).toBe(false);
  });
});

describe("canSubmitSearch", () => {
  it("returns false without brain key", () => {
    expect(canSubmitSearch("", "text", "query", 0)).toBe(false);
  });

  it("returns false for empty text query", () => {
    expect(canSubmitSearch("clip", "text", "", 0)).toBe(false);
    expect(canSubmitSearch("clip", "text", "  ", 0)).toBe(false);
  });

  it("returns true for valid text query", () => {
    expect(canSubmitSearch("clip", "text", "dogs", 0)).toBe(true);
  });

  it("returns false for image query with no samples", () => {
    expect(canSubmitSearch("clip", "image", "", 0)).toBe(false);
  });

  it("returns true for image query with samples", () => {
    expect(canSubmitSearch("clip", "image", "", 3)).toBe(true);
  });
});

describe("buildExecutionParams", () => {
  const baseInput = {
    brainKey: "clip",
    queryType: "text" as const,
    textQuery: "dogs",
    queryIds: [],
    reverse: false,
    patchesField: undefined,
    searchScope: "dataset" as const,
    hasView: false,
    view: [],
    k: "" as const,
    distField: "",
    runName: "",
    negativeQueryIds: [],
  };

  it("builds basic text query params", () => {
    const params = buildExecutionParams(baseInput);
    expect(params.brain_key).toBe("clip");
    expect(params.query_type).toBe("text");
    expect(params.query).toBe("dogs");
    expect(params.reverse).toBe(false);
  });

  it("trims text query", () => {
    const params = buildExecutionParams({
      ...baseInput,
      textQuery: "  dogs  ",
    });
    expect(params.query).toBe("dogs");
  });

  it("uses queryIds for image queries", () => {
    const params = buildExecutionParams({
      ...baseInput,
      queryType: "image",
      queryIds: ["id1", "id2"],
    });
    expect(params.query).toEqual(["id1", "id2"]);
  });

  it("includes k when set", () => {
    const params = buildExecutionParams({ ...baseInput, k: 25 });
    expect(params.k).toBe(25);
  });

  it("excludes k when empty", () => {
    const params = buildExecutionParams({ ...baseInput, k: "" });
    expect(params.k).toBeUndefined();
  });

  it("includes dist_field when set", () => {
    const params = buildExecutionParams({
      ...baseInput,
      distField: "sim_dist",
    });
    expect(params.dist_field).toBe("sim_dist");
  });

  it("includes run_name when set", () => {
    const params = buildExecutionParams({
      ...baseInput,
      runName: "My search",
    });
    expect(params.run_name).toBe("My search");
  });

  it("includes source_view when searching within view", () => {
    const viewStages = [{ _cls: "FilterField" }];
    const params = buildExecutionParams({
      ...baseInput,
      searchScope: "view",
      hasView: true,
      view: viewStages,
    });
    expect(params.source_view).toEqual(viewStages);
  });

  it("excludes source_view when searching full dataset", () => {
    const params = buildExecutionParams({
      ...baseInput,
      searchScope: "dataset",
      hasView: true,
      view: [{ _cls: "FilterField" }],
    });
    expect(params.source_view).toBeUndefined();
  });

  it("includes negative_query_ids when present", () => {
    const params = buildExecutionParams({
      ...baseInput,
      negativeQueryIds: ["neg1", "neg2"],
    });
    expect(params.negative_query_ids).toEqual(["neg1", "neg2"]);
  });
});
