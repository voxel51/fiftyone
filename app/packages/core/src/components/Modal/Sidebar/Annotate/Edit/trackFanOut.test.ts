import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData, LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import {
  buildForwardFill,
  buildTrackFanOut,
  splitTrackEdit,
} from "./trackFanOut";

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

describe("splitTrackEdit", () => {
  it("drops geometry and identity, keeps classification fields as track-level", () => {
    const { trackPartial, dynamicPartial } = splitTrackEdit(
      {
        _id: "doc1",
        instance: { _id: "t1" },
        bounding_box: [0, 0, 1, 1],
        mask_path: "/m.png",
        label: "cat",
        index: 3,
        truncated: true,
      },
      new Set()
    );

    expect(trackPartial).toEqual({ label: "cat", index: 3, truncated: true });
    expect(dynamicPartial).toEqual({});
  });

  it("routes declared dynamic keys to the dynamic half", () => {
    const { trackPartial, dynamicPartial } = splitTrackEdit(
      { label: "car", turn_signal: "left", index: 2 },
      new Set(["turn_signal"])
    );

    expect(trackPartial).toEqual({ label: "car", index: 2 });
    expect(dynamicPartial).toEqual({ turn_signal: "left" });
  });
});

describe("buildForwardFill", () => {
  const dynRef = (frame: number): LabelRef => frameRef(frame);

  it("fills later frames holding the prior value, stopping at the next change", () => {
    const engine = stubEngine([
      { ref: dynRef(1), data: { _id: "a", turn_signal: "off" } },
      { ref: dynRef(2), data: { _id: "b", turn_signal: "off" } },
      { ref: dynRef(3), data: { _id: "c", turn_signal: "off" } },
      { ref: dynRef(4), data: { _id: "d", turn_signal: "right" } },
      { ref: dynRef(5), data: { _id: "e", turn_signal: "off" } },
    ]);

    const writes = buildForwardFill(
      engine,
      dynRef(2),
      { turn_signal: "left" },
      { turn_signal: "off" }
    );

    // frames 3 only — frame 4 already differs (a preserved change point),
    // so the fill stops there and never reaches frame 5
    expect(writes.map((w) => w.ref.frame)).toEqual([3]);
    expect(writes[0].forward).toEqual({ turn_signal: "left" });
    expect(writes[0].inverse).toEqual({ turn_signal: "off" });
  });

  it("never fills earlier frames or the anchor frame", () => {
    const engine = stubEngine([
      { ref: dynRef(1), data: { _id: "a", turn_signal: "off" } },
      { ref: dynRef(2), data: { _id: "b", turn_signal: "off" } },
      { ref: dynRef(3), data: { _id: "c", turn_signal: "off" } },
    ]);

    const writes = buildForwardFill(
      engine,
      dynRef(2),
      { turn_signal: "left" },
      { turn_signal: "off" }
    );

    expect(writes.map((w) => w.ref.frame)).toEqual([3]);
  });

  it("captures an explicit-null inverse where the key was absent", () => {
    const engine = stubEngine([
      { ref: dynRef(1), data: { _id: "a" } },
      { ref: dynRef(2), data: { _id: "b" } },
    ]);

    const writes = buildForwardFill(
      engine,
      dynRef(1),
      { turn_signal: "left" },
      {}
    );

    expect(writes.map((w) => w.ref.frame)).toEqual([2]);
    expect(writes[0].inverse).toEqual({ turn_signal: null });
  });

  it("returns nothing for an empty dynamic partial or a sample-level anchor", () => {
    const engine = stubEngine([{ ref: dynRef(1), data: { _id: "a" } }]);

    expect(buildForwardFill(engine, dynRef(1), {}, {})).toEqual([]);
    expect(
      buildForwardFill(
        engine,
        { sample: "s1", path: "detections", instanceId: "t1" },
        { turn_signal: "left" },
        {}
      )
    ).toEqual([]);
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
