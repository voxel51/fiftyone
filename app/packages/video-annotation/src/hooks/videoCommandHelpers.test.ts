import { describe, expect, it, vi } from "vitest";
import type { SyntheticBox } from "@fiftyone/utilities";
import { copyDetection, detectionAt } from "./videoCommandHelpers";

const box = (overrides: Partial<SyntheticBox> = {}): SyntheticBox => ({
  id: "track-0",
  label: "car",
  bounding_box: [0.1, 0.2, 0.3, 0.4],
  keyframe: true,
  propagation: null,
  ...overrides,
});

describe("detectionAt", () => {
  it("reads the time for a 1-based frame as (frame - 1) / fps", () => {
    const getValue = vi.fn().mockReturnValue({ detections: [] });
    detectionAt({ getValue }, 31, 30, "track-0");
    expect(getValue).toHaveBeenCalledWith(1); // (31 - 1) / 30
  });

  it("returns the detection whose id matches the track", () => {
    const target = box({ id: "track-1" });
    const stream = {
      getValue: () => ({ detections: [box({ id: "track-0" }), target] }),
    };
    expect(detectionAt(stream, 5, 30, "track-1")).toBe(target);
  });

  it("returns undefined when the track is absent on that frame", () => {
    const stream = { getValue: () => ({ detections: [box()] }) };
    expect(detectionAt(stream, 5, 30, "missing")).toBeUndefined();
  });

  it("returns undefined when the frame has no snapshot", () => {
    expect(
      detectionAt({ getValue: () => null }, 5, 30, "track-0")
    ).toBeUndefined();
  });
});

describe("copyDetection", () => {
  it("mints a fresh _id distinct from the source on each call", () => {
    const a = copyDetection(box({ _id: "source" }), { keyframe: false });
    const b = copyDetection(box({ _id: "source" }), { keyframe: false });
    expect(a._id).toEqual(expect.any(String));
    expect(a._id).not.toBe("source");
    expect(a._id).not.toBe(b._id);
    expect(a._cls).toBe("Detection");
  });

  it("carries label and geometry through", () => {
    const copy = copyDetection(box({ label: "person" }), { keyframe: true });
    expect(copy.label).toBe("person");
    expect(copy.bounding_box).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(copy.keyframe).toBe(true);
  });

  it("preserves cross-frame identity (index, instance) when present", () => {
    const instance = { _cls: "Instance", _id: "inst-1" } as const;
    const copy = copyDetection(box({ index: 7, instance }), {
      keyframe: false,
    });
    expect(copy.index).toBe(7);
    expect(copy.instance).toEqual(instance);
  });

  it("omits index/instance keys entirely when the source lacks them", () => {
    const copy = copyDetection(box(), { keyframe: false });
    expect("index" in copy).toBe(false);
    expect("instance" in copy).toBe(false);
  });

  it("applies propagation override only when supplied", () => {
    const withProp = copyDetection(box(), {
      keyframe: false,
      propagation: { source: "interpolation" } as never,
    });
    expect(withProp.propagation).toEqual({ source: "interpolation" });

    const without = copyDetection(box(), { keyframe: false });
    expect("propagation" in without).toBe(false);
  });
});
