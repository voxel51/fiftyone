import { describe, expect, it } from "vitest";
import type { RawDetectionsField } from "@fiftyone/video-annotation";
import { buildDetectionsDelta } from "./useVideoLabelsDeltaSupplier";

const PREFIX = "/frames/5/gt";

const det = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  label: "car",
  bounding_box: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
  keyframe: true,
  ...extra,
});

const field = (
  ...detections: ReturnType<typeof det>[]
): RawDetectionsField => ({
  detections,
});

describe("buildDetectionsDelta", () => {
  it("emits a single add of the whole wrapper when the baseline lacks the array", () => {
    const to = field(det("a"));
    expect(buildDetectionsDelta({}, to, PREFIX)).toEqual([
      { op: "add", path: PREFIX, value: to },
    ]);
  });

  it("diffs matched ids in place at the baseline index, not by array position", () => {
    const from = field(det("a"), det("b", { keyframe: true }));
    // `b` edited; `a` untouched. Its baseline index (1) must drive the path.
    const to = field(det("a"), det("b", { keyframe: false }));

    const deltas = buildDetectionsDelta(from, to, PREFIX);
    expect(deltas).toContainEqual(
      expect.objectContaining({
        path: `${PREFIX}/detections/1/keyframe`,
        value: false,
      })
    );
    // `a` is identical on both sides — nothing emitted for it.
    expect(
      deltas.some((op) => op.path.startsWith(`${PREFIX}/detections/0`))
    ).toBe(false);
  });

  it("appends cache-only ids with `/-` carrying the full detection", () => {
    const from = field(det("a"));
    const newDet = det("b");
    const deltas = buildDetectionsDelta(from, field(det("a"), newDet), PREFIX);
    expect(deltas).toContainEqual({
      op: "add",
      path: `${PREFIX}/detections/-`,
      value: newDet,
    });
  });

  it("removes baseline-only ids in descending index order", () => {
    const from = field(det("a"), det("b"), det("c"), det("d"));
    // keep only `a`; b/c/d deleted
    const deltas = buildDetectionsDelta(from, field(det("a")), PREFIX);
    expect(deltas).toEqual([
      { op: "remove", path: `${PREFIX}/detections/3` },
      { op: "remove", path: `${PREFIX}/detections/2` },
      { op: "remove", path: `${PREFIX}/detections/1` },
    ]);
  });

  it("does not flood per-slot replaces when a list shifts (the regression this guards)", () => {
    // `b` deleted, so `c` slides from index 2 → 1. An index-aligned diff would
    // see slot 1 (b→c) and slot 2 (c→gone) both 'change'; id-alignment must
    // emit exactly one remove for `b` and nothing for the unmoved `a`/`c`.
    const from = field(det("a"), det("b"), det("c"));
    const to = field(det("a"), det("c"));

    const deltas = buildDetectionsDelta(from, to, PREFIX);
    expect(deltas).toEqual([{ op: "remove", path: `${PREFIX}/detections/1` }]);
  });
});
