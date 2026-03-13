import { describe, expect, it } from "vitest";
import { resolveModalGroupSlice } from "./useSetExpandedSample.utils";

const groupMediaTypes = [
  { name: "image", mediaType: "image" },
  { name: "pcd", mediaType: "point-cloud" },
  { name: "ply", mediaType: "3d" },
  { name: "right", mediaType: "image" },
];

const groupMediaTypesMap = {
  image: "image",
  pcd: "point-cloud",
  ply: "3d",
  right: "image",
};

describe("resolveModalGroupSlice", () => {
  it("keeps current modal slice when baseline slice is missing", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: null,
        currentModalSlice: "right",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("right");
  });

  it("prefers deterministic non-3d slice for fresh modal open on 3d baseline", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "pcd",
        currentModalSlice: "pcd",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: false,
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("image");
  });

  it("preserves current modal slice when destination confirms it exists", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: true,
        destinationHasCurrentModalSlice: true,
      })
    ).toBe("right");
  });

  it("keeps pinned 3d baseline when destination does not have current slice", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: true,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("pcd");
  });

  it("falls back to deterministic non-3d slice when unpinned and destination misses current slice", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: false,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("image");
  });

  it("uses baseline slice when baseline is non-3d", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "right",
        currentModalSlice: "pcd",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: true,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("right");
  });

  it("does not preserve unknown current modal slices", () => {
    expect(
      resolveModalGroupSlice({
        groupSlice: "pcd",
        currentModalSlice: "missing-slice",
        groupMediaTypes,
        groupMediaTypesMap,
        hasExistingModal: true,
        is3dPinned: true,
        destinationHasCurrentModalSlice: true,
      })
    ).toBe("pcd");
  });
});
