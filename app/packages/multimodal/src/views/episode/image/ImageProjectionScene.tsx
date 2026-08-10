import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import { buildPointCloudRenderPayload } from "../../../ir";
import type { ImageViewTransform } from "../../../visualization/media-2d/Base2dScene";
import GpuPointCloudProjectionLayer from "../../../visualization/composition/GpuPointCloudProjectionLayer";
import {
  gpuPointCloudProjectionResourceKey,
  gpuPointCloudProjectionStreamKey,
} from "../../../visualization/composition/gpu-point-cloud-projection";
import type { GpuCameraProjection } from "../../../visualization/composition/gpu-camera-projection";
import {
  GpuPointCloudProjectionPicker,
  type GpuPointCloudProjectionPickerHandle,
} from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import {
  getGpuPointCloudProjectionResource,
  type GpuPointCloudProjectionResource,
} from "../../../visualization/composition/gpu-point-cloud-projection-resources";
import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  resolveGpuPointCloudColor,
  type ResolvedGpuPointCloudColor,
} from "../../../visualization/scene-3d";
import {
  hoverMatchesPointFrame,
  type HoverEcho,
} from "../interaction/point-hover/hover-echo";
import type { CameraModel } from "../spatial/camera-geometry/camera-model";
import { toGpuCameraProjection } from "../spatial/camera-geometry/gpu-camera-projection";
import type { ImageProjectionLayer } from "./use-image-projection-layers";
import {
  allocatePointCloudCanvasBudget,
  DEFAULT_MAX_RENDERED_POINTS,
} from "../../../visualization/webgpu/point-cloud-canvas-budget";
import { useWebGpuViewPointCloudBudget } from "../../../visualization/webgpu/WebGpuViewStage";

/** Inputs required to render and inspect projected point clouds for one image. */
export interface ImageProjectionSceneProps {
  readonly cameraModel: CameraModel;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly layers: readonly ImageProjectionLayer[];
  readonly hoveredPoint: HoverEcho | null;
  readonly pointSize: number;
  /** Streams whose full projections are visible and pickable. */
  readonly renderedStreams: readonly string[];
  readonly sourceKey: string;
  readonly viewTransform?: ImageViewTransform;
}

interface PreparedProjectionLayer {
  readonly color: ResolvedGpuPointCloudColor;
  readonly layer: ImageProjectionLayer;
  readonly projection: GpuCameraProjection;
  readonly resource: GpuPointCloudProjectionResource;
  readonly resourceKey: string;
}

const HOVER_ECHO_GROWTH = 1.1;
const HOVER_ECHO_ANIMATION_MS = 150;
const HOVER_ECHO_MIN_SCREEN_PX = 8;
const HOVER_ECHO_RENDER_ORDER = 9_000;

/** GPU scene content and on-demand picker for one camera tile. */
export const ImageProjectionScene = forwardRef<
  GpuPointCloudProjectionPickerHandle,
  ImageProjectionSceneProps
>(function ImageProjectionScene(
  {
    cameraModel,
    fit,
    imageHeight,
    imageWidth,
    hoveredPoint,
    layers,
    pointSize,
    renderedStreams,
    sourceKey,
    viewTransform,
  },
  pickerRef,
) {
  const preparedLayers = useMemo(
    () =>
      layers.flatMap((layer): readonly PreparedProjectionLayer[] => {
        // Projection is direct in the vertex graph. Preparing a layer means
        // composing one matrix and acquiring shared buffers, not projecting
        // or colorizing every point for this camera on the CPU.
        const payload = layer.payload;
        const projection = toGpuCameraProjection({
          model: cameraModel,
          rotation: layer.rotation,
          translation: layer.translation,
        });
        if (!projection || payload.sampledPointCount === 0) {
          return [];
        }

        // streamKey owns reusable stream buffers; resourceKey names the frame
        // currently stored in them. Camera count is intentionally absent from
        // both keys so all image tiles share one upload.
        const resourceKey = gpuPointCloudProjectionResourceKey(
          sourceKey,
          layer.stream,
          layer.contentTimeNs,
        );
        const streamKey = gpuPointCloudProjectionStreamKey(
          sourceKey,
          layer.stream,
        );
        return [
          {
            color: resolveGpuPointCloudColor(payload, layer.colorOptions),
            layer,
            projection,
            resource: getGpuPointCloudProjectionResource({
              contentKey: resourceKey,
              payload,
              streamKey,
            }),
            resourceKey,
          },
        ];
      }),
    [cameraModel, layers, sourceKey],
  );
  const renderedLayers = useMemo(() => {
    const streams = new Set(renderedStreams);
    return preparedLayers.filter(({ layer }) => streams.has(layer.stream));
  }, [preparedLayers, renderedStreams]);
  const pointBudgetDemands = useMemo(
    () =>
      renderedLayers.map(({ layer, resource }) => ({
        id: layer.stream,
        pointCount: resource.sampledPointCount,
      })),
    [renderedLayers],
  );
  const sharedPointBudget = useWebGpuViewPointCloudBudget(pointBudgetDemands);
  const localPointBudget = useMemo(
    () =>
      allocatePointCloudCanvasBudget(
        pointBudgetDemands,
        DEFAULT_MAX_RENDERED_POINTS,
      ),
    [pointBudgetDemands],
  );
  const pointBudget =
    sharedPointBudget.size > 0 ? sharedPointBudget : localPointBudget;
  const pickLayers = useMemo(
    () =>
      // Visible and pick passes bind the exact same attributes/matrices. This
      // prevents a separate projection representation from drifting from what
      // the user sees.
      renderedLayers.map(({ layer, projection, resource, resourceKey }) => ({
        positionAttribute: resource.positionAttribute,
        projection,
        resourceKey,
        sampledPointCount:
          pointBudget.get(layer.stream) ?? resource.sampledPointCount,
        sourceIndexAttribute: resource.sourceIndexAttribute,
      })),
    [pointBudget, renderedLayers],
  );

  return (
    <>
      {renderedLayers.map(({ color, layer, projection, resource }) => (
        <GpuPointCloudProjectionLayer
          calibrationHeight={cameraModel.height}
          calibrationWidth={cameraModel.width}
          color={color}
          fit={fit}
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          key={layer.stream}
          pointSize={pointSize}
          projection={projection}
          renderedPointCount={pointBudget.get(layer.stream)}
          resource={resource}
          viewTransform={viewTransform}
        />
      ))}
      <GpuPointCloudProjectionPicker
        calibrationHeight={cameraModel.height}
        calibrationWidth={cameraModel.width}
        layers={pickLayers}
        ref={pickerRef}
      />
      <ProjectedHoverMarker
        cameraModel={cameraModel}
        fit={fit}
        hoveredPoint={hoveredPoint}
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        pointSize={pointSize}
        preparedLayers={preparedLayers}
        viewTransform={viewTransform}
      />
    </>
  );
});

function ProjectedHoverMarker({
  cameraModel,
  fit,
  hoveredPoint,
  imageHeight,
  imageWidth,
  pointSize,
  preparedLayers,
  viewTransform,
}: Omit<
  ImageProjectionSceneProps,
  "layers" | "renderedStreams" | "sourceKey" | "hoveredPoint"
> & {
  readonly hoveredPoint: HoverEcho | null;
  readonly preparedLayers: readonly PreparedProjectionLayer[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const animationStartRef = useRef(0);
  const [pointSizeScale, setPointSizeScale] = useState(1);
  const pointHover = hoveredPoint?.kind === "point" ? hoveredPoint : null;
  const prepared = pointHover
    ? preparedLayers.find(({ layer }) =>
        hoverMatchesPointFrame(pointHover, layer.stream, layer.contentTimeNs),
      )
    : undefined;
  // Reuse the production projection layer for hover emphasis. A one-point
  // payload keeps marker projection/fit semantics identical to cloud points
  // instead of maintaining a parallel DOM/canvas coordinate path.
  const markerPayload = useMemo(
    () =>
      pointHover
        ? buildPointCloudRenderPayload({
            colors: pointHover.color
              ? Float32Array.from(pointHover.color)
              : undefined,
            positions: Float32Array.from(pointHover.position),
          })
        : null,
    [pointHover],
  );
  const markerColor = useMemo<ResolvedGpuPointCloudColor>(() => {
    const color = pointHover?.color ?? ([1, 1, 1] as const);
    return {
      colorRamp: null,
      colormap: DEFAULT_POINT_CLOUD_COLORMAP,
      source: { color, kind: "uniform" },
    };
  }, [pointHover?.color]);
  const markerResource = useMemo(() => {
    if (!pointHover || !prepared || !markerPayload) return null;
    // Isolate the marker stream from the main grow-only stream resource: its
    // tiny capacity and frame cadence should never resize or overwrite the
    // cloud buffers shared by camera tiles.
    return getGpuPointCloudProjectionResource({
      contentKey: `${prepared.resourceKey}\nhover:${pointHover.pointIndex}`,
      payload: markerPayload,
      streamKey: `${prepared.resource.streamKey}\nhover`,
    });
  }, [markerPayload, pointHover, prepared]);

  // This effect restarts the hover-marker animation for each hovered point.
  useEffect(() => {
    animationStartRef.current = performance.now();
    setPointSizeScale(1);
    invalidate();
  }, [invalidate, pointHover]);

  useFrame(() => {
    if (!pointHover) {
      return;
    }
    const elapsed = performance.now() - animationStartRef.current;
    const t = Math.min(1, elapsed / HOVER_ECHO_ANIMATION_MS);
    const eased = 1 - (1 - t) ** 3;
    const nextScale = 1 + (HOVER_ECHO_GROWTH - 1) * eased;
    // The shared image stage uses a demand frameloop. Updating state and
    // invalidating explicitly advances this short animation, then goes idle.
    setPointSizeScale((current) =>
      Math.abs(current - nextScale) > 0.0001 ? nextScale : current,
    );
    if (t < 1) {
      invalidate();
    }
  });

  if (!pointHover || !prepared || !markerResource) {
    return null;
  }

  return (
    <GpuPointCloudProjectionLayer
      circular
      calibrationHeight={cameraModel.height}
      calibrationWidth={cameraModel.width}
      color={markerColor}
      fit={fit}
      imageHeight={imageHeight}
      imageWidth={imageWidth}
      minScreenPointSize={HOVER_ECHO_MIN_SCREEN_PX}
      pointSize={pointSize}
      pointSizeScale={pointSizeScale}
      projection={prepared.projection}
      renderOrder={HOVER_ECHO_RENDER_ORDER}
      resource={markerResource}
      viewTransform={viewTransform}
    />
  );
}

export default ImageProjectionScene;
