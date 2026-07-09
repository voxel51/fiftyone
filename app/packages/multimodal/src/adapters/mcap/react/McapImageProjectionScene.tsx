import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPointCloudRenderPayload,
  type CameraCalibrationVisualization,
} from "../../../decoders";
import type { ImageViewTransform } from "../../../visualization/panels/base-2d-scene";
import GpuPointCloudProjectionLayer from "../../../visualization/panels/gpu/GpuPointCloudProjectionLayer";
import {
  gpuPointCloudProjectionResourceKey,
  gpuPointCloudProjectionStreamKey,
  sensorToImageProjectionMatrix,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection";
import {
  GpuPointCloudProjectionPicker,
  type GpuPointCloudProjectionPickerHandle,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection-picker";
import {
  getGpuPointCloudProjectionResource,
  type GpuPointCloudProjectionResource,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection-resources";
import {
  complementaryRgbUnit,
  DEFAULT_POINT_CLOUD_COLORMAP,
  resolveGpuPointCloudColor,
  type ResolvedGpuPointCloudColor,
} from "../../../visualization/panels/point-cloud";
import type { McapHoverEcho } from "./mcap-hover-echo";
import type { McapImageProjectionLayer } from "./use-mcap-image-projection-layers";

/** Inputs required to render and inspect projected point clouds for one image. */
export interface McapImageProjectionSceneProps {
  readonly calibration: CameraCalibrationVisualization;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly layers: readonly McapImageProjectionLayer[];
  readonly hoveredPoint: McapHoverEcho | null;
  readonly pointSize: number;
  readonly sourceKey: string;
  readonly viewTransform?: ImageViewTransform;
}

interface PreparedProjectionLayer {
  readonly color: ResolvedGpuPointCloudColor;
  readonly layer: McapImageProjectionLayer;
  readonly projectionMatrix: NonNullable<
    ReturnType<typeof sensorToImageProjectionMatrix>
  >;
  readonly resource: GpuPointCloudProjectionResource;
  readonly resourceKey: string;
}

const HOVER_ECHO_GROWTH = 1.1;
const HOVER_ECHO_ANIMATION_MS = 150;
const HOVER_ECHO_MIN_SCREEN_PX = 8;
const HOVER_ECHO_RENDER_ORDER = 9_000;

/** GPU scene content and on-demand picker for one camera tile. */
export const McapImageProjectionScene = forwardRef<
  GpuPointCloudProjectionPickerHandle,
  McapImageProjectionSceneProps
>(function McapImageProjectionScene(
  {
    calibration,
    fit,
    imageHeight,
    imageWidth,
    hoveredPoint,
    layers,
    pointSize,
    sourceKey,
    viewTransform,
  },
  pickerRef,
) {
  const preparedLayers = useMemo(
    () =>
      layers.flatMap((layer): readonly PreparedProjectionLayer[] => {
        const payload = layer.payload;
        const projectionMatrix = sensorToImageProjectionMatrix({
          calibration,
          rotation: layer.rotation,
          translation: layer.translation,
        });
        if (!projectionMatrix || payload.sampledPointCount === 0) {
          return [];
        }

        const resourceKey = gpuPointCloudProjectionResourceKey(
          sourceKey,
          layer.topic,
          layer.contentTimeNs,
        );
        const streamKey = gpuPointCloudProjectionStreamKey(
          sourceKey,
          layer.topic,
        );
        return [
          {
            color: resolveGpuPointCloudColor(payload, layer.colorOptions),
            layer,
            projectionMatrix,
            resource: getGpuPointCloudProjectionResource({
              contentKey: resourceKey,
              payload,
              streamKey,
            }),
            resourceKey,
          },
        ];
      }),
    [calibration, layers, sourceKey],
  );
  const pickLayers = useMemo(
    () =>
      preparedLayers.map(({ projectionMatrix, resource, resourceKey }) => ({
        positionAttribute: resource.positionAttribute,
        projectionMatrix,
        resourceKey,
        sampledPointCount: resource.sampledPointCount,
        sourceIndexAttribute: resource.sourceIndexAttribute,
      })),
    [preparedLayers],
  );

  return (
    <>
      {preparedLayers.map(({ color, layer, projectionMatrix, resource }) => (
        <GpuPointCloudProjectionLayer
          calibrationHeight={calibration.height}
          calibrationWidth={calibration.width}
          color={color}
          fit={fit}
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          key={layer.topic}
          pointSize={pointSize}
          projectionMatrix={projectionMatrix}
          resource={resource}
          viewTransform={viewTransform}
        />
      ))}
      <GpuPointCloudProjectionPicker
        calibrationHeight={calibration.height}
        calibrationWidth={calibration.width}
        layers={pickLayers}
        ref={pickerRef}
      />
      <ProjectedHoverMarker
        calibration={calibration}
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
  calibration,
  fit,
  hoveredPoint,
  imageHeight,
  imageWidth,
  pointSize,
  preparedLayers,
  viewTransform,
}: Omit<
  McapImageProjectionSceneProps,
  "layers" | "sourceKey" | "hoveredPoint"
> & {
  readonly hoveredPoint: McapHoverEcho | null;
  readonly preparedLayers: readonly PreparedProjectionLayer[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const animationStartRef = useRef(0);
  const [pointSizeScale, setPointSizeScale] = useState(1);
  const pointHover = hoveredPoint?.kind === "point" ? hoveredPoint : null;
  const prepared = pointHover
    ? preparedLayers.find(({ layer }) => layer.topic === pointHover.topic)
    : undefined;
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
    const color = pointHover?.color
      ? complementaryRgbUnit(pointHover.color)
      : ([1, 1, 1] as const);
    return {
      colorRamp: null,
      colormap: DEFAULT_POINT_CLOUD_COLORMAP,
      source: { color, kind: "uniform" },
    };
  }, [pointHover?.color]);
  const markerResource = useMemo(() => {
    if (!pointHover || !prepared || !markerPayload) return null;
    return getGpuPointCloudProjectionResource({
      contentKey: `${prepared.resourceKey}\nhover:${pointHover.pointIndex}`,
      payload: markerPayload,
      streamKey: `${prepared.resource.streamKey}\nhover`,
    });
  }, [markerPayload, pointHover, prepared]);

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
      calibrationHeight={calibration.height}
      calibrationWidth={calibration.width}
      color={markerColor}
      fit={fit}
      imageHeight={imageHeight}
      imageWidth={imageWidth}
      minScreenPointSize={HOVER_ECHO_MIN_SCREEN_PX}
      pointSize={pointSize}
      pointSizeScale={pointSizeScale}
      projectionMatrix={prepared.projectionMatrix}
      renderOrder={HOVER_ECHO_RENDER_ORDER}
      resource={markerResource}
      viewTransform={viewTransform}
    />
  );
}

export default McapImageProjectionScene;
