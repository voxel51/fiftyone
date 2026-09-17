import {
  DETECTION_FIELD,
  DETECTIONS_FIELD,
  KEYPOINT_FIELD,
  KEYPOINTS_FIELD,
} from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { keypointFilter } from ".";

describe("path filter handling", () => {
  it("overrides keypoint array filters", () => {
    const keypoint = keypointFilter("test", KEYPOINT_FIELD, () => false);
    expect(keypoint({ test: [] })).toBe(true);

    const keypoints = keypointFilter("test", KEYPOINTS_FIELD, () => false);
    expect(keypoints({ test: [] })).toBe(true);
  });

  it("does not override other label fields", () => {
    const keypoint = keypointFilter("test", DETECTION_FIELD, () => false);
    expect(keypoint({ test: [] })).toBe(false);

    const keypoints = keypointFilter("test", DETECTIONS_FIELD, () => false);
    expect(keypoints({ test: [] })).toBe(false);
  });
});
