/**
 * The `/frames` → flat-FramesData adapter: frame keying, the `frames.<field>`
 * path, element pass-through, `_id` normalization, and empty/absent fields.
 */

import { describe, expect, it } from "vitest";

import type { FrameDocLike } from "./framesData";
import { parseFramesData } from "./framesData";

const doc = (frame_number: number, detections: unknown[]): FrameDocLike => ({
  frame_number,
  detections: { detections },
});

describe("parseFramesData", () => {
  it("flattens to { [frame]: { 'frames.<field>': elements } }", () => {
    const data = parseFramesData(
      [
        doc(1, [{ _id: "d1", instance: { _id: "A", _cls: "Instance" } }]),
        doc(2, [{ _id: "d2", instance: { _id: "A", _cls: "Instance" } }]),
      ],
      "detections"
    );

    expect(Object.keys(data)).toEqual(["1", "2"]);
    expect(data[1]["frames.detections"]).toHaveLength(1);
    expect(data[1]["frames.detections"][0].instance).toEqual({
      _id: "A",
      _cls: "Instance",
    });
  });

  it("passes element fields through whole and stamps _cls", () => {
    const data = parseFramesData(
      [
        doc(1, [
          { _id: "d1", label: "car", bounding_box: [0, 0, 1, 1], mask: "m" },
        ]),
      ],
      "detections"
    );

    const el = data[1]["frames.detections"][0];
    expect(el).toMatchObject({
      _id: "d1",
      _cls: "Detection",
      label: "car",
      bounding_box: [0, 0, 1, 1],
      mask: "m",
    });
  });

  it("normalizes _id from a raw `id` when `_id` is absent", () => {
    const data = parseFramesData([doc(1, [{ id: "legacy" }])], "detections");

    expect(data[1]["frames.detections"][0]._id).toBe("legacy");
  });

  it("respects a non-default per-frame field name", () => {
    const data = parseFramesData(
      [{ frame_number: 5, boxes: { detections: [{ _id: "d1" }] } }],
      "boxes"
    );

    expect(data[5]["frames.boxes"]).toHaveLength(1);
  });

  it("emits an empty list for a fetched frame with no detections", () => {
    const data = parseFramesData(
      [{ frame_number: 3 }, doc(4, [])],
      "detections"
    );

    expect(data[3]["frames.detections"]).toEqual([]);
    expect(data[4]["frames.detections"]).toEqual([]);
  });
});
