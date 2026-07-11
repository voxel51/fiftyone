import type { RefObject } from "react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/panels/base-2d-scene";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/panels/gpu/gpu-point-cloud-projection-picker";
import { gpuPointCloudProjectionResourceKey } from "../../../visualization/panels/gpu/gpu-point-cloud-projection";
import {
  POINT_HOVER_DWELL_MS,
  POINT_HOVER_MOVE_TOLERANCE_PX,
} from "../../../visualization/panels/hover-inspect";
import { attachPointerDwell } from "../../../visualization/panels/pointer-dwell";
import {
  DEFAULT_POINT_SIZE,
  gpuPointCloudColorAtSample,
  resolveGpuPointCloudColor,
} from "../../../visualization/panels/point-cloud";
import { useSetMcapHoverEcho, type McapHoverEcho } from "./mcap-hover-echo";
import { mcapHoveredPointForFrame } from "./mcap-point-hover";
import {
  Mcap3dHoverTooltip,
  type Mcap3dHoverTooltipState,
} from "./use-mcap-3d-hover-tooltip";
import type { McapImageProjectionLayer } from "./use-mcap-image-projection-layers";
import type { McapCameraModel } from "./camera-geometry/mcap-camera-model";

const PROJECTION_PICK_RADIUS_SCREEN_PX = 6;

/**
 * DOM interaction surface for GPU pointcloud projections. Rendering and hit
 * testing live in the image's R3F scene; this component owns only dwell
 * timing, coordinate conversion, tooltip UI, and cross-pane hover state.
 */
const McapImageProjectionOverlay = ({
  cameraModel,
  fit,
  imageHeight,
  imageWidth,
  layers,
  pickerRef,
  pointSize,
  sourceKey,
  viewTransform,
}: {
  readonly cameraModel: McapCameraModel;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly layers: readonly McapImageProjectionLayer[];
  readonly pickerRef: RefObject<GpuPointCloudProjectionPickerHandle>;
  readonly pointSize: number;
  readonly sourceKey: string;
  readonly viewTransform?: ImageViewTransform;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dwellTooltip, setDwellTooltip] =
    useState<Mcap3dHoverTooltipState | null>(null);
  const setSharedHover = useSetMcapHoverEcho();
  const publishedHoverRef = useRef<McapHoverEcho | null>(null);
  const requestGenerationRef = useRef(0);

  // The pointer subscription stays stable while playback and TF data churn.
  const cameraModelRef = useRef(cameraModel);
  cameraModelRef.current = cameraModel;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const imageDimsRef = useRef({ height: imageHeight, width: imageWidth });
  imageDimsRef.current = { height: imageHeight, width: imageWidth };
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const pointSizeRef = useRef(pointSize);
  pointSizeRef.current = pointSize;
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;
  const viewTransformRef = useRef(viewTransform);
  viewTransformRef.current = viewTransform;

  // This effect owns pointer-based GPU picking for the projection overlay.
  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) {
      return undefined;
    }

    const clearOwnHover = () => {
      // Pointer cancellation cannot cancel mapAsync itself. Bump both the DOM
      // generation and controller generation so a late integer texel is inert.
      requestGenerationRef.current += 1;
      pickerRef.current?.invalidate();
      setDwellTooltip(null);
      const published = publishedHoverRef.current;
      if (!published) {
        return;
      }
      publishedHoverRef.current = null;
      setSharedHover((current) => (current === published ? null : current));
    };

    const pickAt = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const picker = pickerRef.current;
      const calib = cameraModelRef.current;
      if (!container || !picker || !(calib.width > 0) || !(calib.height > 0)) {
        clearOwnHover();
        return;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearOwnHover();
        return;
      }
      const dims = imageDimsRef.current;
      const rect = transformedImageDisplayRect(
        imageDisplayRect(
          { height: bounds.height, width: bounds.width },
          dims,
          fitRef.current,
        ),
        viewTransformRef.current,
      );
      if (rect.width <= 0 || rect.height <= 0) {
        clearOwnHover();
        return;
      }

      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      // The picker shader operates in calibration pixels, not CSS pixels or
      // normalized device coordinates. Undo contain/cover plus pan/zoom here.
      const targetU = ((pointerX - rect.x) / rect.width) * calib.width;
      const targetV = ((pointerY - rect.y) / rect.height) * calib.height;
      const screenPxPerCalibrationPx = rect.width / calib.width;
      // Convert the screen-space interaction radius back into calibration
      // pixels so hit behavior remains stable as the image is fitted/zoomed.
      const radiusPx =
        Math.max(
          PROJECTION_PICK_RADIUS_SCREEN_PX,
          projectionDotSize(calib.width, pointSizeRef.current) *
            screenPxPerCalibrationPx,
        ) / screenPxPerCalibrationPx;
      const generation = ++requestGenerationRef.current;

      void picker
        .pick({ radiusPx, targetU, targetV })
        .then((pick) => {
          if (generation !== requestGenerationRef.current) {
            return;
          }
          if (!pick) {
            clearOwnHover();
            return;
          }

          // Resolve by immutable resource identity rather than array position:
          // topic order or playback content may change while readback waits.
          const currentLayers = layersRef.current;
          const layer = currentLayers.find(
            (candidate) =>
              gpuPointCloudProjectionResourceKey(
                sourceKeyRef.current,
                candidate.topic,
                candidate.contentTimeNs,
              ) === pick.resourceKey,
          );
          const payload = layer?.payload;
          if (
            !layer ||
            !payload ||
            pick.sampleIndex < 0 ||
            pick.sampleIndex >= payload.sampledPointCount
          ) {
            clearOwnHover();
            return;
          }
          // The GPU writes both sampled and decoded identities. sampledPoint
          // drives GPU color lookup; sourceIndex drives the public tooltip from
          // the full decoded frame without scanning for the original point.
          const pointIndex = pick.sourceIndex;
          const tooltip = mcapHoveredPointForFrame(
            layer.topic,
            layer.frame,
            pointIndex,
          );
          const color = gpuPointCloudColorAtSample(
            resolveGpuPointCloudColor(payload, layer.colorOptions),
            payload,
            pick.sampleIndex,
          );
          if (!tooltip || !color) {
            clearOwnHover();
            return;
          }

          setDwellTooltip({ ...tooltip, color, x: pointerX, y: pointerY });
          const hover: McapHoverEcho = {
            color,
            kind: "point",
            pointIndex,
            position: tooltip.position,
            topic: layer.topic,
          };
          publishedHoverRef.current = hover;
          setSharedHover(hover);
        })
        .catch(() => {
          if (generation === requestGenerationRef.current) {
            clearOwnHover();
          }
        });
    };

    const detach = attachPointerDwell(surface, {
      dwellMs: POINT_HOVER_DWELL_MS,
      moveTolerancePx: POINT_HOVER_MOVE_TOLERANCE_PX,
      onCancel: clearOwnHover,
      onDwell: pickAt,
    });
    return () => {
      detach();
      clearOwnHover();
    };
  }, [pickerRef, setSharedHover]);

  return (
    <div
      data-mcap-image-projection-overlay
      ref={containerRef}
      style={containerStyle}
    >
      {dwellTooltip ? <Mcap3dHoverTooltip tooltip={dwellTooltip} /> : null}
    </div>
  );
};

/** Dot size in calibration pixels, matching the projection material. */
function projectionDotSize(
  calibrationWidth: number,
  pointSize: number,
): number {
  return Math.max(
    2,
    Math.round((calibrationWidth / 400) * (pointSize / DEFAULT_POINT_SIZE)),
  );
}

const containerStyle: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  position: "absolute",
};

export default McapImageProjectionOverlay;
