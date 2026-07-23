import { VISUALIZATION_KIND, type ImageVisualization } from "../../../../ir";
import type { CameraFrustumPanelLayer } from "../../../../visualization/scene-3d/types";
import { describe, expect, it, vi } from "vitest";

import { buildScene3dFrustumLayer } from "./use-scene-3d-frustum-layers";

describe("buildScene3dFrustumLayer", () => {
  it("links hover and modified selection to the image tile", () => {
    const clearHovered = vi.fn(() => true);
    const onHoverCamera = vi.fn();
    const openImageTile = vi.fn();
    const setHovered = vi.fn();
    const layer = buildScene3dFrustumLayer({
      calibrationAssociation: "Auto-matched",
      calibrationSourceName: "/camera/front/camera_info",
      clearHovered,
      focused: true,
      geometry: "original",
      hovered: true,
      imageFrame: null,
      imageLabel: "camera/front/image_raw",
      imagePlaneDepthM: 2,
      imageSourceName: "/camera/front/image_raw",
      imageStream: "7",
      layer: {
        ...calibrationLayer(),
        parentPosition: {
          kind: "resolved",
          origin: [0.2, 0.1, 1.5],
          parentFrameId: "base_link",
        },
      },
      onHoverCamera,
      opacity: 0.6,
      openImageTile,
      setHovered,
      sourceKey: "recording",
    });

    expect(layer).toMatchObject({
      highlighted: true,
      imagePlaneDepthM: 2,
      imageStream: "7",
      opacity: 0.6,
      requireCameraRayModel: true,
      selected: true,
    });
    layer.onHover?.(true);
    expect(setHovered).toHaveBeenCalledWith("7");
    expect(onHoverCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        calibrationAssociation: "Auto-matched",
        calibrationSourceName: "/camera/front/camera_info",
        calibrationStream: "3",
        imageLabel: "camera/front/image_raw",
        imageSourceName: "/camera/front/image_raw",
        imageStream: "7",
        kind: "camera",
        parentPosition: {
          kind: "resolved",
          origin: [0.2, 0.1, 1.5],
          parentFrameId: "base_link",
        },
      }),
    );
    layer.onHover?.(false);
    expect(clearHovered).toHaveBeenCalledWith("7");
    expect(onHoverCamera).toHaveBeenLastCalledWith(null);
    layer.onSelect?.({ metaKey: false });
    layer.onSelect?.({ metaKey: true });
    expect(openImageTile).toHaveBeenCalledOnce();
  });

  it("attaches a ready image and shared texture identity", () => {
    const frame = {
      ageNs: 0n,
      contentTimeNs: 42n,
      frame: {} as ImageVisualization,
      requestedTimeNs: 42n,
    };
    const layer = buildScene3dFrustumLayer({
      calibrationAssociation: "Selected in settings",
      calibrationSourceName: "/camera/front/camera_info",
      clearHovered: () => true,
      focused: false,
      geometry: "auto",
      hovered: false,
      imageFrame: frame,
      imageLabel: "camera/front/image_raw",
      imagePlaneDepthM: 1,
      imageSourceName: "/camera/front/image_raw",
      imageStream: "7",
      layer: calibrationLayer(),
      onHoverCamera: () => undefined,
      opacity: 1,
      openImageTile: () => undefined,
      setHovered: () => undefined,
      sourceKey: "recording",
    });

    expect(layer.image).toBe(frame.frame);
    expect(layer.imageContentTimeNs).toBe(42n);
    expect(layer.imageTextureKey).toContain("7");
    expect(layer.cameraRayModel).toBeDefined();
  });
});

function calibrationLayer(): CameraFrustumPanelLayer {
  return {
    frame: {
      coordinateFrameId: "front_camera",
      D: [-0.2, 0.03, 0, 0, 0],
      distortionModel: "plumb_bob",
      height: 100,
      K: [80, 0, 50, 0, 80, 50, 0, 0, 1],
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      P: [80, 0, 50, 0, 0, 80, 50, 0, 0, 0, 1, 0],
      R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      width: 100,
    },
    id: "3",
  };
}
