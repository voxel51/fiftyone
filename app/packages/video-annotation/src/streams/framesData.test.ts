/**
 * The `/frames` → flat-FramesData adapter: frame keying, the `frames.<field>`
 * path, multi-field projection, element pass-through, `_id` normalization, and
 * empty/absent fields.
 */

import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import type { FrameDocLike } from "./framesData";
import {
  ELEMENT_CLS,
  parseFramesData,
  PROJECTABLE_FRAME_LABEL_TYPES,
} from "./framesData";

const DETECTIONS = { "frames.detections": LabelType.Detections };

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
      DETECTIONS,
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
          {
            _id: "d1",
            label: "car",
            bounding_box: [0, 0, 1, 1],
            mask_path: "/p/m.png",
          },
        ]),
      ],
      DETECTIONS,
    );

    const el = data[1]["frames.detections"][0];
    expect(el).toMatchObject({
      _id: "d1",
      _cls: "Detection",
      label: "car",
      bounding_box: [0, 0, 1, 1],
      mask_path: "/p/m.png",
    });
  });

  it("projects multiple label fields per frame with the right child + _cls", () => {
    const data = parseFramesData(
      [
        {
          frame_number: 1,
          detections: { detections: [{ _id: "d1", label: "car" }] },
          polylines: {
            polylines: [{ _id: "p1", points: [[[0, 0]]], closed: true }],
          },
        },
      ],
      {
        "frames.detections": LabelType.Detections,
        "frames.polylines": LabelType.Polylines,
      },
    );

    expect(data[1]["frames.detections"][0]).toMatchObject({
      _id: "d1",
      _cls: "Detection",
    });
    expect(data[1]["frames.polylines"][0]).toMatchObject({
      _id: "p1",
      _cls: "Polyline",
      points: [[[0, 0]]],
      closed: true,
    });
  });

  it("normalizes _id from a raw `id` when `_id` is absent", () => {
    const data = parseFramesData([doc(1, [{ id: "legacy" }])], DETECTIONS);

    expect(data[1]["frames.detections"][0]._id).toBe("legacy");
  });

  it("respects a non-default per-frame field name", () => {
    const data = parseFramesData(
      [{ frame_number: 5, boxes: { detections: [{ _id: "d1" }] } }],
      { "frames.boxes": LabelType.Detections },
    );

    expect(data[5]["frames.boxes"]).toHaveLength(1);
  });

  it("emits an empty list for every registered field on a label-less frame", () => {
    const data = parseFramesData([{ frame_number: 3 }, doc(4, [])], DETECTIONS);

    expect(data[3]["frames.detections"]).toEqual([]);
    expect(data[4]["frames.detections"]).toEqual([]);
  });
});

/**
 * Regression cover for the parity gap: keypoints and classifications are
 * painted by the Lighter adapters and were painted by the video looker, but
 * the frame projection used to know only Detections and Polylines — so an
 * active `frames.keypoints` registered into the store and then silently
 * rendered nothing.
 */
describe("per-frame label type coverage", () => {
  it("projects keypoints, stamping the singular _cls", () => {
    const data = parseFramesData(
      [
        {
          frame_number: 1,
          keypoints: {
            keypoints: [
              {
                _id: "k1",
                points: [
                  [0.1, 0.2],
                  [0.3, 0.4],
                ],
              },
            ],
          },
        },
      ],
      { "frames.keypoints": LabelType.Keypoints },
    );

    const [keypoint] = data[1]["frames.keypoints"];
    expect(keypoint._cls).toBe("Keypoint");
    expect(keypoint._id).toBe("k1");
    // Geometry survives the projection whole — the adapter reads `points`.
    expect(keypoint.points).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("projects classifications, stamping the singular _cls", () => {
    const data = parseFramesData(
      [
        {
          frame_number: 4,
          classifications: {
            classifications: [{ _id: "c1", label: "sunny", confidence: 0.9 }],
          },
        },
      ],
      { "frames.classifications": LabelType.Classifications },
    );

    const [classification] = data[4]["frames.classifications"];
    expect(classification._cls).toBe("Classification");
    expect(classification.label).toBe("sunny");
    expect(classification.confidence).toBe(0.9);
  });

  it("projects every advertised type in one pass", () => {
    const data = parseFramesData(
      [
        {
          frame_number: 1,
          detections: { detections: [{ _id: "d" }] },
          polylines: { polylines: [{ _id: "p", points: [[[0, 0]]] }] },
          keypoints: { keypoints: [{ _id: "k", points: [[0, 0]] }] },
          classifications: { classifications: [{ _id: "c" }] },
        },
      ],
      {
        "frames.detections": LabelType.Detections,
        "frames.polylines": LabelType.Polylines,
        "frames.keypoints": LabelType.Keypoints,
        "frames.classifications": LabelType.Classifications,
      },
    );

    expect(Object.keys(data[1]).sort()).toEqual([
      "frames.classifications",
      "frames.detections",
      "frames.keypoints",
      "frames.polylines",
    ]);
  });

  it("advertises exactly the types it can project", () => {
    // The guard against the original bug: anything in this set but missing an
    // ELEMENT_CLS entry is dropped by `toFieldSpecs` and never paints, so the
    // set is derived rather than restated. Keep them in lockstep.
    expect([...PROJECTABLE_FRAME_LABEL_TYPES].sort()).toEqual(
      Object.keys(ELEMENT_CLS).sort(),
    );
  });

  it("drops a type it has no element _cls for", () => {
    // Segmentations have no per-element list, so they must not be projected —
    // registering one would add a store field that never seeds.
    const data = parseFramesData(
      [{ frame_number: 1, segmentations: { segmentations: [{ _id: "s" }] } }],
      { "frames.segmentations": LabelType.Segmentation },
    );

    expect(data[1]).toEqual({});
  });
});
