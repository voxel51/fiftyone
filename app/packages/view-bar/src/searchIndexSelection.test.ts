import { describe, expect, it } from "vitest";
import { patchesFieldOfView, resolveSearchIndex } from "./searchIndexSelection";
import type { SerializedStage } from "./state";

const stage = (cls: string, kwargs: [string, unknown][]): SerializedStage =>
  ({ _cls: cls, kwargs }) as SerializedStage;

const INDEXES = [
  { key: "recent-samples", patchesField: null },
  { key: "gt-patches", patchesField: "ground_truth" },
  { key: "older-samples", patchesField: null },
];

describe("patchesFieldOfView", () => {
  it("finds the last ToPatches stage's field", () => {
    const view = [
      stage("fiftyone.core.stages.Limit", [["limit", 5]]),
      stage("fiftyone.core.stages.ToPatches", [["field", "ground_truth"]]),
    ];
    expect(patchesFieldOfView(view)).toBe("ground_truth");
  });

  it("is null for a view that does not stand in patches", () => {
    expect(
      patchesFieldOfView([stage("fiftyone.core.stages.Limit", [["limit", 5]])]),
    ).toBe(null);
  });
});

describe("resolveSearchIndex", () => {
  it("an explicit pick always wins", () => {
    expect(
      resolveSearchIndex(INDEXES, "older-samples", "ground_truth")?.key,
    ).toBe("older-samples");
  });

  it("a patches view prefers the matching patches index", () => {
    expect(resolveSearchIndex(INDEXES, null, "ground_truth")?.key).toBe(
      "gt-patches",
    );
  });

  it("a patches view with no matching index falls back to the first", () => {
    expect(resolveSearchIndex(INDEXES, null, "predictions")?.key).toBe(
      "recent-samples",
    );
  });

  it("a flat view takes the first index", () => {
    expect(resolveSearchIndex(INDEXES, null, null)?.key).toBe("recent-samples");
  });
});
