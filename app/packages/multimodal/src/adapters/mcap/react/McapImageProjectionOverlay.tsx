import type { RefObject } from "react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { CameraCalibrationVisualization } from "../../../decoders";
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
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../../visualization/panels/style-tokens";
import { hasNonTrivialDistortion } from "./mcap-image-calibration";
import { useSetMcapHoverEcho, type McapHoverEcho } from "./mcap-hover-echo";
import { mcapHoveredPointForFrame } from "./mcap-point-hover";
import {
  Mcap3dHoverTooltip,
  type Mcap3dHoverTooltipState,
} from "./use-mcap-3d-hover-tooltip";
import type { McapImageProjectionLayer } from "./use-mcap-image-projection-layers";

const PROJECTION_PICK_RADIUS_SCREEN_PX = 6;

/**
 * DOM interaction surface for GPU pointcloud projections. Rendering and hit
 * testing live in the image's R3F scene; this component owns only dwell
 * timing, coordinate conversion, tooltip UI, and cross-pane hover state.
 */
const McapImageProjectionOverlay = ({
  calibration,
  fit,
  imageHeight,
  imageWidth,
  layers,
  pickerRef,
  pointSize,
  sourceKey,
  viewTransform,
}: {
  readonly calibration: CameraCalibrationVisualization;
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
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
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

  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) {
      return undefined;
    }

    const clearOwnHover = () => {
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
      const calib = calibrationRef.current;
      if (!container || !picker || !(calib.width > 0)) {
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
      const targetU = ((pointerX - rect.x) / rect.width) * calib.width;
      const targetV = ((pointerY - rect.y) / rect.height) * calib.height;
      const screenPxPerCalibrationPx = rect.width / calib.width;
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

          setDwellTooltip({ ...tooltip, x: pointerX, y: pointerY });
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
    <div aria-hidden ref={containerRef} style={containerStyle}>
      {dwellTooltip ? <Mcap3dHoverTooltip tooltip={dwellTooltip} /> : null}
      {hasNonTrivialDistortion(calibration) ? (
        <div style={noticeStyle}>
          Pointcloud projections assume rectified images
        </div>
      ) : null}
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

const noticeStyle: CSSProperties = {
  background: VISUALIZATION_HUD_BACKGROUND_COLOR,
  border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
  borderRadius: 4,
  bottom: 8,
  color: VISUALIZATION_HUD_TEXT_COLOR,
  fontSize: 11,
  left: 8,
  padding: "4px 6px",
  position: "absolute",
};

export default McapImageProjectionOverlay;
