/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  readOnly: false,
  canAnnotate: true,
  mediaType: "image",
  parentMediaType: "image",
  isGeneratedView: false,
  isPatchesView: false,
  slices: [] as string[],
  isGroup: false,
  isDynamic: false,
  isNestedDynamic: false,
  isQueryPerformant: true,
}));

vi.mock("recoil", () => ({
  useRecoilValue: (node: { key: string }) => {
    switch (node.key) {
      case "readOnly":
        return state.readOnly;
      case "canAnnotate":
        return { enabled: state.canAnnotate };
      case "mediaType":
        return state.mediaType;
      case "isGeneratedView":
        return state.isGeneratedView;
      case "isPatchesView":
        return state.isPatchesView;
      default:
        throw new Error(`unexpected recoil node ${node.key}`);
    }
  },
}));

vi.mock("@fiftyone/state", () => ({
  canAnnotate: { key: "canAnnotate" },
  isGeneratedView: { key: "isGeneratedView" },
  isPatchesView: { key: "isPatchesView" },
  mediaType: { key: "mediaType" },
  readOnly: { key: "readOnly" },
  useGroupSlices: () => state.slices,
  useIsDynamicGroup: () => state.isDynamic,
  useIsGroupDataset: () => state.isGroup,
  useIsNestedDynamicGroup: () => state.isNestedDynamic,
  useIsQueryPerformantDynamicGroup: () => state.isQueryPerformant,
  useParentMediaType: () => state.parentMediaType,
}));

import useCanAnnotate from "./useCanAnnotate";

const reason = () => renderHook(() => useCanAnnotate()).result.current;

/** An ordered dynamic group view reports the "group" media type with no slices. */
const dynamicGroupOver = (parentMediaType: string) => {
  state.isDynamic = true;
  state.isGroup = true;
  state.mediaType = "group";
  state.parentMediaType = parentMediaType;
};

describe("useCanAnnotate on dynamic groups", () => {
  beforeEach(() => {
    Object.assign(state, {
      readOnly: false,
      canAnnotate: true,
      mediaType: "image",
      parentMediaType: "image",
      isGeneratedView: false,
      isPatchesView: false,
      slices: [],
      isGroup: false,
      isDynamic: false,
      isNestedDynamic: false,
      isQueryPerformant: true,
    });
  });

  it("enables an image dynamic group without mistaking it for a sliceless group dataset", () => {
    dynamicGroupOver("image");
    expect(reason()).toEqual({ showAnnotationTab: true, disabledReason: null });
  });

  it("reports a dynamic group that is not query performant", () => {
    dynamicGroupOver("image");
    state.isQueryPerformant = false;
    expect(reason().disabledReason).toBe("dynamicGroupNotQueryPerformant");
  });

  it("keeps the multimodal block for a dynamic group over multimodal samples", () => {
    dynamicGroupOver("multimodal");
    expect(reason().disabledReason).toBe("multimodalDataset");
  });

  it("keeps the generated-view block for a dynamic group over a non-patches generated view", () => {
    dynamicGroupOver("image");
    state.isGeneratedView = true;
    expect(reason().disabledReason).toBe("generatedView");
  });

  it("lets a nested dynamic group fall through to the group dataset logic", () => {
    dynamicGroupOver("image");
    state.isNestedDynamic = true;
    expect(reason().disabledReason).toBe("groupDatasetNoSupportedSlices");
  });
});
