import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useActiveAnnotationSampleId,
  useThreeDSceneSampleId,
} from "./useGroupAnnotationSample";

let mockModalSampleId: string | null = "image-id";
let mockInteractionSample: { sample?: { _id: string } } | undefined;
let mockMain2dVisible = false;

vi.mock("@fiftyone/state", () => ({
  groupMediaIsMain2DViewerVisible: "groupMediaIsMain2DViewerVisible",
  useStableInteraction3dSample: () => mockInteractionSample,
  useModalSample: () => ({ sample: { _id: mockModalSampleId } }),
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => mockMain2dVisible,
}));

// pinning walks fo3d -> pcd -> fo3d in a grouped image + fo3d + pcd modal; the
// annotated sample must follow the pin each time, never the fo3d scene
describe("useActiveAnnotationSampleId", () => {
  it("follows the pinned 3D sample across an A -> B -> A pin walk", () => {
    mockInteractionSample = { sample: { _id: "mesh-id" } };
    const { result, rerender } = renderHook(() => ({
      active: useActiveAnnotationSampleId(),
      scene: useThreeDSceneSampleId(),
    }));
    expect(result.current).toEqual({ active: "mesh-id", scene: "mesh-id" });

    mockInteractionSample = { sample: { _id: "cloud-id" } };
    rerender();
    expect(result.current).toEqual({ active: "cloud-id", scene: "cloud-id" });

    mockInteractionSample = { sample: { _id: "mesh-id" } };
    rerender();
    expect(result.current).toEqual({ active: "mesh-id", scene: "mesh-id" });
  });

  it("annotates the selected 2D slice while the 2D viewer is the surface", () => {
    mockInteractionSample = { sample: { _id: "mesh-id" } };
    mockMain2dVisible = true;
    const { result } = renderHook(() => useActiveAnnotationSampleId());
    expect(result.current).toBe("image-id");
    mockMain2dVisible = false;
  });

  it("collapses to the modal sample when the pinned 3D sample is the modal sample", () => {
    mockModalSampleId = "scene-id";
    mockInteractionSample = { sample: { _id: "scene-id" } };
    const { result } = renderHook(() => ({
      active: useActiveAnnotationSampleId(),
      scene: useThreeDSceneSampleId(),
    }));
    expect(result.current).toEqual({ active: "scene-id", scene: undefined });
    mockModalSampleId = "image-id";
  });
});
