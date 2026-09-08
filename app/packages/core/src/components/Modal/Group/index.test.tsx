/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Group from ".";

const mockState = vi.hoisted(() => ({
  values: {
    dynamicGroupsViewMode: "pagination",
    groupMediaIsCarouselVisibleSetting: false,
    groupMediaIsMain2DViewerVisible: true,
    isDynamicGroup: false,
    isNestedDynamicGroup: false,
    isOrderedDynamicGroup: false,
    only3d: false,
  },
  group3dState: {
    is3dVisible: true,
    is3dVisibleSetting: true,
    isPinned: false,
  },
  modalMode: "EXPLORE",
  setDynamicGroupsViewMode: vi.fn(),
  setMainVisible: vi.fn(),
  setPinned: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  ModalMode: {
    ANNOTATE: "ANNOTATE",
    EXPLORE: "EXPLORE",
  },
  dynamicGroupsViewMode: () => ({ key: "dynamicGroupsViewMode" }),
  groupMediaIsCarouselVisibleSetting: {
    key: "groupMediaIsCarouselVisibleSetting",
  },
  groupMediaIsMain2DViewerVisible: {
    key: "groupMediaIsMain2DViewerVisible",
  },
  groupMediaIsMain2DViewerVisibleSetting: {
    key: "groupMediaIsMain2DViewerVisibleSetting",
  },
  isDynamicGroup: { key: "isDynamicGroup" },
  isNestedDynamicGroup: { key: "isNestedDynamicGroup" },
  isOrderedDynamicGroup: { key: "isOrderedDynamicGroup" },
  only3d: { key: "only3d" },
  useIs3dVisible: () => mockState.group3dState.is3dVisible,
  useIs3dVisibleSetting: () => mockState.group3dState.is3dVisibleSetting,
  useIs3dPinned: () => mockState.group3dState.isPinned,
  useRenderConfig3dActions: () => ({
    setPinned: mockState.setPinned,
  }),
  useModalMode: () => mockState.modalMode,
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useRecoilState: (node: { key: string }) => {
      if (node.key === "dynamicGroupsViewMode") {
        return [
          mockState.values.dynamicGroupsViewMode,
          mockState.setDynamicGroupsViewMode,
        ];
      }

      throw new Error(`Unexpected recoil state: ${node.key}`);
    },
    useRecoilValue: (node: { key: string }) => {
      if (!(node.key in mockState.values)) {
        throw new Error(`Unexpected recoil value: ${node.key}`);
      }

      return mockState.values[node.key as keyof typeof mockState.values];
    },
    useSetRecoilState: (node: { key: string }) => {
      if (node.key === "groupMediaIsMain2DViewerVisibleSetting") {
        return mockState.setMainVisible;
      }

      throw new Error(`Unexpected recoil setter: ${node.key}`);
    },
  };
});

vi.mock("./DynamicGroup", () => ({
  DynamicGroup: () => <div>dynamic-group</div>,
}));

vi.mock("./GroupView", () => ({
  GroupView: () => <div>group-view</div>,
}));

vi.mock("./GroupSample3d", () => ({
  default: () => <div>group-sample-3d</div>,
}));

describe("Group", () => {
  beforeEach(() => {
    mockState.values = {
      dynamicGroupsViewMode: "pagination",
      groupMediaIsCarouselVisibleSetting: false,
      groupMediaIsMain2DViewerVisible: true,
      isDynamicGroup: false,
      isNestedDynamicGroup: false,
      isOrderedDynamicGroup: false,
      only3d: false,
    };
    mockState.group3dState = {
      is3dVisible: true,
      is3dVisibleSetting: true,
      isPinned: false,
    };
    mockState.modalMode = "EXPLORE";
    mockState.setDynamicGroupsViewMode.mockReset();
    mockState.setMainVisible.mockReset();
    mockState.setPinned.mockReset();
  });

  it("pins 3d when the main viewer is hidden and the 3d viewer is visible", async () => {
    mockState.values.groupMediaIsMain2DViewerVisible = false;

    render(<Group />);

    await waitFor(() => {
      expect(mockState.setPinned).toHaveBeenCalledWith(true);
    });
  });

  it("does not repin 3d when the main viewer is still visible", async () => {
    render(<Group />);

    await waitFor(() => {
      expect(mockState.setPinned).not.toHaveBeenCalled();
    });
  });
});
