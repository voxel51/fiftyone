/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Skeleton field-key resolution.
 *
 * Skeletons are registered under the dataset's TOP-LEVEL field name, so a
 * frame path has to resolve through its last segment. Getting this wrong is
 * silent: the lookup misses the registry, falls through to the dataset default
 * (null for most datasets), and the keypoints simply render unconnected with
 * nothing to point at.
 */

import { describe, expect, it } from "vitest";

import { skeletonFieldKey } from "./dataset";

describe("skeletonFieldKey", () => {
  it("resolves a frame path through its last segment", () => {
    expect(skeletonFieldKey("frames.keypoints")).toBe("keypoints");
  });

  it("leaves a top-level path alone", () => {
    expect(skeletonFieldKey("keypoints")).toBe("keypoints");
  });

  it("takes the last segment of a deeper path", () => {
    expect(skeletonFieldKey("frames.pose.keypoints")).toBe("keypoints");
  });

  it("is the identity for a path with no segments to strip", () => {
    expect(skeletonFieldKey("")).toBe("");
  });
});
