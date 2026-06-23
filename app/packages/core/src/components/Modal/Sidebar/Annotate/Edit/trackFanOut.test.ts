import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData, LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { buildTrackFanOut, trackLevelPartial } from "./trackFanOut";

const DETECTIONS = "Detections" as LabelType;

/** A stub engine over a fixed set of frame occurrences. */
const stubEngine = (refs: { ref: LabelRef; data: LabelData }[]) => ({
  getLabelType: () => DETECTIONS,
  enumerateLabels: (_kinds: readonly LabelType[]) => refs.map((r) => r.ref),
  getLabel: (ref: LabelRef) =>
    refs.find(
      (r) => r.ref.instanceId === ref.instanceId && r.ref.frame === ref.frame
    )?.data,
});

const frameRef = (frame: number, instanceId = "t1"): LabelRef => ({
  sample: "s1",
  path: "frames.detections",
  instanceId,
  frame,
});

describe("trackLevelPartial", () => {
  it("drops geometry and identity, keeps classification fields", () => {
    expect(
      trackLevelPartial({
        _id: "doc1",
        instance: { _id: "t1" },
        bounding_box: [0, 0, 1, 1],
        mask_path: "/m.png",
        label: "cat",
        index: 3,
        truncated: true,
      })
    ).toEqual({ label: "cat", index: 3, truncated: true });
  });
});

describe("buildTrackFanOut", () => {
  it("fans a track-level edit to every other frame, never the anchor frame", () => {
    const engine = stubEngine([
      { ref: frameRef(1), data: { _id: "a", label: "cat" } },
      { ref: frameRef(2), data: { _id: "b", label: "cat" } },
      { ref: frameRef(3), data: { _id: "c", label: "cat" } },
    ]);

    const writes = buildTrackFanOut(engine, frameRef(2), { label: "dog" });

    expect(writes.map((w) => w.ref.frame)).toEqual([1, 3]);
    expect(writes.every((w) => w.forward.label === "dog")).toBe(true);
  });

  it("captures a per-frame inverse — prior value, or null where absent", () => {
    const engine = stubEngine([
      { ref: frameRef(1), data: { _id: "a", label: "cat", index: 1 } },
      { ref: frameRef(2), data: { _id: "b", label: "cat" } },
    ]);

    const writes = buildTrackFanOut(engine, frameRef(2), {
      label: "dog",
      index: 9,
    });

    // frame 1 had both fields
    expect(writes[0].inverse).toEqual({ label: "cat", index: 1 });
  });

  it("ignores other instances and other paths via the anchor filter", () => {
    const engine = {
      getLabelType: () => DETECTIONS,
      enumerateLabels: () => [
        frameRef(1, "t1"),
        frameRef(1, "t2"),
        { sample: "s1", path: "detections", instanceId: "t1", frame: 1 },
      ],
      getLabel: () => ({ _id: "x" } as LabelData),
    };

    const writes = buildTrackFanOut(engine, frameRef(3, "t1"), {
      label: "dog",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].ref.instanceId).toBe("t1");
    expect(writes[0].ref.path).toBe("frames.detections");
  });

  it("returns nothing for a geometry-only edit (empty track partial)", () => {
    const engine = stubEngine([{ ref: frameRef(1), data: { _id: "a" } }]);
    expect(buildTrackFanOut(engine, frameRef(2), {})).toEqual([]);
  });
});
