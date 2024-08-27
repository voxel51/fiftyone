import { KEYPOINT_FIELD, KEYPOINTS_FIELD } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { keypointFilter } from ".";

describe("path filter handling", () => {
  it("overrides keypoint object filters", () => {
    const keypoint = keypointFilter("test", KEYPOINT_FIELD, () => false);
    expect(keypoint({ test: [] })).toBe(true);

    const keypoints = keypointFilter("test", KEYPOINTS_FIELD, () => false);
    expect(keypoints({ test: [] })).toBe(true);
  });
});
