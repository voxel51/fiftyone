/**
 * Which per-frame fields video Explore paints: `frames.*` only, resolved
 * against the frame schema, and narrowed to the types the frame projection
 * can actually seed.
 */

import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { toExploreFrameLabelFields } from "./exploreFrameLabelFields";

const schema = (entries: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(entries).map(([path, cls]) => [
      path,
      { embeddedDocType: `fiftyone.core.labels.${cls}` },
    ]),
  );

describe("toExploreFrameLabelFields", () => {
  it("keys by the frames.-prefixed path and resolves the label type", () => {
    expect(
      toExploreFrameLabelFields(
        ["frames.detections"],
        schema({ detections: "Detections" }),
      ),
    ).toEqual({ "frames.detections": LabelType.Detections });
  });

  it("ignores sample-level active paths", () => {
    // The frame store owns the `frames.` namespace only; a sample-level field
    // registered here would be addressed against frame data that never has it.
    expect(
      toExploreFrameLabelFields(
        ["ground_truth", "predictions"],
        schema({ detections: "Detections" }),
      ),
    ).toEqual({});
  });

  it("admits every type the frame projection can paint", () => {
    // Keypoints and classifications regressed once: the sidebar listed them
    // active and nothing rendered, because the projection did not know them.
    expect(
      toExploreFrameLabelFields(
        [
          "frames.detections",
          "frames.polylines",
          "frames.keypoints",
          "frames.classifications",
        ],
        schema({
          detections: "Detections",
          polylines: "Polylines",
          keypoints: "Keypoints",
          classifications: "Classifications",
        }),
      ),
    ).toEqual({
      "frames.detections": LabelType.Detections,
      "frames.polylines": LabelType.Polylines,
      "frames.keypoints": LabelType.Keypoints,
      "frames.classifications": LabelType.Classifications,
    });
  });

  it("drops types the projection cannot seed", () => {
    // Better to omit than to register: a registered-but-unseeded field is
    // walked on every frame diff and still paints nothing.
    expect(
      toExploreFrameLabelFields(
        ["frames.segmentations", "frames.detections"],
        schema({
          segmentations: "Segmentation",
          detections: "Detections",
        }),
      ),
    ).toEqual({ "frames.detections": LabelType.Detections });
  });

  it("drops a path the frame schema does not describe", () => {
    expect(
      toExploreFrameLabelFields(["frames.detections"], schema({})),
    ).toEqual({});
  });

  it("tolerates a missing schema", () => {
    expect(toExploreFrameLabelFields(["frames.detections"], null)).toEqual({});
  });

  it("returns nothing when no field is active", () => {
    expect(
      toExploreFrameLabelFields([], schema({ detections: "Detections" })),
    ).toEqual({});
  });
});
