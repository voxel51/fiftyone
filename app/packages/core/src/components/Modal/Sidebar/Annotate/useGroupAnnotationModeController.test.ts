/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { hasApplicableAnnotationSlice } from "./useGroupAnnotationModeController";
import type { AnnotationSliceInfo } from "./useGroupAnnotationSlices";

const slice = (over: Partial<AnnotationSliceInfo>): AnnotationSliceInfo => ({
  name: "slice",
  mediaType: "image",
  isSupported: true,
  is3D: false,
  isMissing: false,
  ...over,
});

describe("hasApplicableAnnotationSlice", () => {
  it("is false while slices are loading", () => {
    expect(hasApplicableAnnotationSlice("loading")).toBe(false);
  });

  it("is false for an empty slice list (group data not cached yet)", () => {
    expect(hasApplicableAnnotationSlice([])).toBe(false);
  });

  it("is false when every slice is missing from the current group", () => {
    // The first-open bug: currentGroupSliceNames is empty, so resolveSlices
    // marks every slice as missing.
    expect(
      hasApplicableAnnotationSlice([
        slice({ name: "left", isMissing: true }),
        slice({
          name: "pcd",
          is3D: true,
          mediaType: "point-cloud",
          isMissing: true,
        }),
      ])
    ).toBe(false);
  });

  it("is false when the only present slices are unsupported", () => {
    expect(
      hasApplicableAnnotationSlice([
        slice({ name: "video", mediaType: "video", isSupported: false }),
      ])
    ).toBe(false);
  });

  it("is true once a supported, present slice is available", () => {
    expect(
      hasApplicableAnnotationSlice([
        slice({ name: "left", isMissing: true }),
        slice({
          name: "pcd",
          is3D: true,
          mediaType: "point-cloud",
          isMissing: false,
        }),
      ])
    ).toBe(true);
  });
});
