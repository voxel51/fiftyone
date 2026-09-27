import { describe, expect, it } from "vitest";
import {
  isPlainScope,
  reconcileSelection,
  renderedCaptures,
} from "./grid-hooks";
import type { EpisodeSelection } from "./types";

describe("legacy selection reconciliation", () => {
  it("does nothing when both stores already agree", () => {
    expect(reconcileSelection(null, ["a"], ["a"], null)).toEqual({
      kind: "none",
    });
  });

  it("lets the tray win on first sight, and never adopts foreign ids", () => {
    expect(reconcileSelection(null, ["a"], ["b"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
    expect(reconcileSelection(null, [], ["b"], null)).toEqual({ kind: "wait" });
    expect(reconcileSelection(null, [], ["b"], new Set(["a"]))).toEqual({
      kind: "push",
      ids: [],
    });
    expect(reconcileSelection(null, [], ["b"], new Set(["a", "b"]))).toEqual({
      kind: "adopt",
      capture: ["b"],
      remove: [],
    });
  });

  it("adopts changes made only on the legacy side and pushes tray changes", () => {
    const previous = { tray: ["a", "b"], legacy: ["a", "b"] };
    expect(reconcileSelection(previous, ["a", "b"], ["a", "c"], null)).toEqual({
      kind: "adopt",
      capture: ["c"],
      remove: ["b"],
    });
    expect(reconcileSelection(previous, ["a"], ["a", "b"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
    expect(reconcileSelection(previous, ["a"], ["c"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
  });
});

describe("rendered captures", () => {
  const capture = (id: string): EpisodeSelection => ({
    episodeId: id,
    members: [{ episodeId: id, kind: "episode" }],
  });
  const selected = (count: number) =>
    new Map(
      Array.from({ length: count }, (_, i) => `e${i}`).map((id) => [
        id,
        capture(id),
      ]),
    );

  it("describes every capture until the strip folds, then only its two ends", () => {
    expect(renderedCaptures(selected(100), 0)).toHaveLength(100);
    const ends = renderedCaptures(selected(1000), 0);
    expect(ends).toHaveLength(100);
    expect(ends[0]).toBe("e0");
    expect(ends[49]).toBe("e49");
    expect(ends[50]).toBe("e950");
    expect(ends[99]).toBe("e999");
    expect(renderedCaptures(selected(1000), 50)).toHaveLength(200);
  });
});

it.each(["ToFrames", "ToClips", "ToTrajectories"])(
  "resolves source references for explicit %s selections",
  (stage) => {
    expect(
      isPlainScope({
        view: [{ _cls: `fiftyone.core.stages.${stage}`, kwargs: [] }],
        filters: {},
        extendedStages: {},
        boundary: {},
      }),
    ).toBe(false);
  },
);
