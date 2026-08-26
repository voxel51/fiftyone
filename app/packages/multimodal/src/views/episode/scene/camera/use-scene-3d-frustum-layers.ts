import { useMemo } from "react";

import type { CameraVisualization, SceneSource } from "../../../../ir";
import { isSharedEncodedVideoVisualization } from "../../../../video/types";
import { imageTextureCacheKey } from "../../../../visualization/media-2d/image-texture-cache";
import { useKeyedIdentityMap } from "../../../../visualization/panel-ui/use-keyed-identity-map";
import type { CameraFrustumPanelLayer } from "../../../../visualization/scene-3d/types";
import type { Scene3dHoveredCamera } from "../../interaction/point-hover/use-hover-tooltip";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import type {
  ImageGeometryMode,
  ImageProjectionSettings,
} from "../../settings/modal/state";
import { DEFAULT_IMAGE_PROJECTION } from "../../settings/modal/state";
import { cameraRayModel } from "../../spatial/camera-geometry/camera-ray-model";
import { resolveCameraModel } from "../../spatial/camera-geometry/camera-model";
import {
  useFrustumImageHover,
  useHoveredImageStream,
  useImageTileBindings,
} from "../../tiles/tile-source-bindings";
import { useOpenImageTile } from "../../tiles/use-open-image-tile";
import {
  frameTransformIdentityInputs,
  frustumParentPositionIdentityInputs,
} from "../entities/scene-3d-layer-identity";

interface FrustumLayerActions {
  readonly clearHovered: (stream: string) => boolean;
  readonly onHoverCamera: (
    ownerKey: string,
    hovered: Scene3dHoveredCamera | null,
  ) => void;
  readonly openImageTile: (stream: string) => void;
  readonly setHovered: (stream: string) => void;
}

interface BuildFrustumLayerOptions extends FrustumLayerActions {
  readonly calibrationAssociation: Scene3dHoveredCamera["calibrationAssociation"];
  readonly calibrationSourceName: string;
  readonly focused: boolean;
  readonly geometry: ImageGeometryMode;
  readonly hovered: boolean;
  readonly imageFrame: StreamPlaybackFrame<CameraVisualization> | null;
  readonly imageLabel: string;
  readonly imagePlaneDepthM: number;
  readonly imageSourceName: string;
  readonly imageStream: string;
  readonly layer: CameraFrustumPanelLayer;
  readonly opacity: number;
  readonly sourceKey: string;
}

/**
 * Adds image-plane presentation and cross-tile interactions to one calibrated
 * frustum without coupling the pure scene-layer builder to image tiles.
 */
export function buildScene3dFrustumLayer({
  calibrationAssociation,
  calibrationSourceName,
  clearHovered,
  focused,
  geometry,
  hovered,
  imageFrame,
  imageLabel,
  imagePlaneDepthM,
  imageSourceName,
  imageStream,
  layer,
  onHoverCamera,
  opacity,
  openImageTile,
  setHovered,
  sourceKey,
}: BuildFrustumLayerOptions): CameraFrustumPanelLayer {
  const cameraModelResolution = resolveCameraModel({
    calibration: layer.frame,
    geometry,
    imageSourceName,
  });
  const rayCameraModelResolution =
    cameraModelResolution.status === "ready"
      ? cameraModelResolution
      : resolveCameraModel({
          calibration: layer.frame,
          geometry: "original",
          imageSourceName,
        });
  const resolvedCameraRayModel =
    rayCameraModelResolution.status === "ready"
      ? cameraRayModel(rayCameraModelResolution.model)
      : undefined;
  const linked: Partial<CameraFrustumPanelLayer> = imageStream
    ? {
        highlighted: hovered,
        imageStream,
        onHover: (isHovered) => {
          if (isHovered) {
            setHovered(imageStream);
            onHoverCamera(layer.id, {
              calibrationAssociation,
              calibrationSourceName,
              calibrationStream: layer.id,
              distortionModel: layer.frame.distortionModel,
              frameId: layer.frame.coordinateFrameId,
              imageLabel,
              imageStream,
              kind: "camera",
              parentPosition: layer.parentPosition ?? {
                kind: "unavailable",
                reason: "Parent frame unavailable",
              },
              resolution: [layer.frame.width, layer.frame.height],
            });
            return;
          }
          clearHovered(imageStream);
          onHoverCamera(layer.id, null);
        },
        onSelect: ({ metaKey }) => {
          if (metaKey) openImageTile(imageStream);
        },
        selected: focused,
      }
    : {};
  const imageProps: Partial<CameraFrustumPanelLayer> = imageFrame
    ? cameraModelResolution.status === "ready"
      ? imageFrame.frame.kind === "encoded-video"
        ? isSharedEncodedVideoVisualization(imageFrame.frame)
          ? {
              imageContentTimeNs: imageFrame.contentTimeNs,
              video: imageFrame.frame,
            }
          : {
              imageUnavailableReason: `Video codec ${imageFrame.frame.codec} is unsupported`,
            }
        : {
            image: imageFrame.frame,
            imageContentTimeNs: imageFrame.contentTimeNs,
            imageTextureKey:
              sourceKey && imageStream
                ? imageTextureCacheKey(
                    sourceKey,
                    imageStream,
                    imageFrame.contentTimeNs,
                  )
                : undefined,
          }
      : { imageUnavailableReason: cameraModelResolution.message }
    : {};

  return {
    ...layer,
    ...linked,
    ...imageProps,
    cameraRayModel: resolvedCameraRayModel,
    imagePlaneDepthM,
    opacity,
    requireCameraRayModel: true,
  };
}

/** Decorates all camera frustums with their current image and tile linkage. */
export function useScene3dFrustumLayers({
  cameraFrustumLayers,
  cameraSources,
  cameraStreams,
  focusedTileId,
  frustumImageFrames,
  frustumImageStreams,
  imagePlaneDepthM,
  imageProjectionSettings,
  imageSources,
  onHoverCamera,
  opacity,
  sourceKey,
}: {
  readonly cameraFrustumLayers: readonly CameraFrustumPanelLayer[];
  readonly cameraSources: readonly SceneSource[];
  readonly cameraStreams: readonly string[];
  readonly focusedTileId: string | null | undefined;
  readonly frustumImageFrames: readonly (StreamPlaybackFrame<CameraVisualization> | null)[];
  readonly frustumImageStreams: readonly string[];
  readonly imagePlaneDepthM: number;
  readonly imageProjectionSettings: Readonly<
    Record<string, ImageProjectionSettings>
  >;
  readonly imageSources: readonly SceneSource[];
  readonly onHoverCamera: (
    ownerKey: string,
    hovered: Scene3dHoveredCamera | null,
  ) => void;
  readonly opacity: number;
  readonly sourceKey: string;
}): readonly CameraFrustumPanelLayer[] {
  const openImageTile = useOpenImageTile();
  const frustumImageHover = useFrustumImageHover();
  const hoveredImageStream = useHoveredImageStream();
  const imageTileBindings = useImageTileBindings();
  const cameraSourcesById = useMemo(
    () => new Map(cameraSources.map((source) => [source.id, source])),
    [cameraSources],
  );
  const imageSourcesById = useMemo(
    () => new Map(imageSources.map((source) => [source.id, source])),
    [imageSources],
  );
  const focusedImageStream = focusedTileId
    ? (imageTileBindings[focusedTileId] ?? null)
    : null;
  const layerCandidates = useKeyedIdentityMap(cameraFrustumLayers, {
    build: (layer) => {
      const index = cameraStreams.indexOf(layer.id);
      const imageStream = index >= 0 ? (frustumImageStreams[index] ?? "") : "";
      const cameraSource = cameraSourcesById.get(layer.id);
      const imageSource = imageSourcesById.get(imageStream);
      const projectionSettings =
        imageProjectionSettings[imageStream] ?? DEFAULT_IMAGE_PROJECTION;
      return buildScene3dFrustumLayer({
        calibrationAssociation: projectionSettings.calibrationStream
          ? "Selected in settings"
          : "Auto-matched",
        calibrationSourceName:
          cameraSource?.sourceName ?? "Unknown calibration source",
        clearHovered: frustumImageHover.clearIfCurrent,
        focused: focusedImageStream === imageStream,
        geometry: imageStream ? projectionSettings.geometry : "original",
        hovered: hoveredImageStream === imageStream,
        imageFrame: index >= 0 ? (frustumImageFrames[index] ?? null) : null,
        imageLabel: imageSource?.label ?? "Unknown image source",
        imagePlaneDepthM,
        imageSourceName: imageSource?.sourceName ?? "Unknown image source",
        imageStream,
        layer,
        onHoverCamera,
        opacity,
        openImageTile,
        setHovered: frustumImageHover.setHovered,
        sourceKey,
      });
    },
    inputs: (layer) => {
      const index = cameraStreams.indexOf(layer.id);
      const imageStream = index >= 0 ? (frustumImageStreams[index] ?? "") : "";
      return [
        layer.frame,
        layer.contentTimeNs,
        ...frameTransformIdentityInputs(layer.frameTransform),
        ...frustumParentPositionIdentityInputs(layer.parentPosition),
        index >= 0 ? frustumImageFrames[index] : null,
        imageStream,
        cameraSourcesById.get(layer.id)?.sourceName ?? "",
        imageSourcesById.get(imageStream)?.label ?? "",
        imageSourcesById.get(imageStream)?.sourceName ?? "",
        imageStream ? imageProjectionSettings[imageStream] : null,
        imageStream !== "" && hoveredImageStream === imageStream,
        imageStream !== "" && focusedImageStream === imageStream,
        frustumImageHover,
        openImageTile,
        onHoverCamera,
        imagePlaneDepthM,
        opacity,
        sourceKey,
      ];
    },
    key: (layer) => layer.id,
  });

  return useMemo(
    () =>
      layerCandidates.filter(
        (layer): layer is CameraFrustumPanelLayer => layer !== null,
      ),
    [layerCandidates],
  );
}
