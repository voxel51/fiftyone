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
      clearHovered,
      focused: true,
      geometry: "original",
      hovered: true,
      imageFrame: null,
      imagePlaneDepthM: 2,
      imageStream: "/camera/front/image",
      layer: calibrationLayer(),
      onHoverCamera,
      opacity: 0.6,
      openImageTile,
      setHovered,
      sourceKey: "recording",
    });

    expect(layer).toMatchObject({
      highlighted: true,
      imagePlaneDepthM: 2,
      imageStream: "/camera/front/image",
      opacity: 0.6,
      requireCameraRayModel: true,
      selected: true,
    });
    layer.onHover?.(true);
    expect(setHovered).toHaveBeenCalledWith("/camera/front/image");
    expect(onHoverCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        calibrationStream: "/camera/front/calibration",
        kind: "camera",
      }),
    );
    layer.onHover?.(false);
    expect(clearHovered).toHaveBeenCalledWith("/camera/front/image");
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
      clearHovered: () => true,
      focused: false,
      geometry: "original",
      hovered: false,
      imageFrame: frame,
      imagePlaneDepthM: 1,
      imageStream: "/camera/front/image",
      layer: calibrationLayer(),
      onHoverCamera: () => undefined,
      opacity: 1,
      openImageTile: () => undefined,
      setHovered: () => undefined,
      sourceKey: "recording",
    });

    expect(layer.image).toBe(frame.frame);
    expect(layer.imageContentTimeNs).toBe(42n);
    expect(layer.imageTextureKey).toContain("/camera/front/image");
    expect(layer.cameraRayModel).toBeDefined();
  });
});

function calibrationLayer(): CameraFrustumPanelLayer {
  return {
    frame: {
      coordinateFrameId: "front_camera",
      height: 100,
      K: [80, 0, 50, 0, 80, 50, 0, 0, 1],
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      width: 100,
    },
    id: "/camera/front/calibration",
  };
}
