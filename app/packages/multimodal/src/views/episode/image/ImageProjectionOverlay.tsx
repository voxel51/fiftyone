import type { RefObject } from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/media-2d/Base2dScene";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import { gpuPointCloudProjectionResourceKey } from "../../../visualization/composition/gpu-point-cloud-projection";
import {
  POINT_HOVER_DWELL_MS,
  POINT_HOVER_MOVE_TOLERANCE_PX,
} from "../../../visualization/interaction/hover-inspect";
import { attachPointerDwell } from "../../../visualization/interaction/pointer-dwell";
import {
  DEFAULT_POINT_SIZE,
  gpuPointCloudColorAtSample,
  resolveGpuPointCloudColor,
} from "../../../visualization/scene-3d";
import {
  useOwnedHoverEchoPublisher,
  type HoverEcho,
} from "../interaction/point-hover/hover-echo";
import { hoveredPointForFrame } from "../interaction/point-hover/point-hover";
import {
  Scene3dHoverTooltip,
  type Scene3dHoverTooltipState,
} from "../interaction/point-hover/use-hover-tooltip";
import type { ImageProjectionLayer } from "./use-image-projection-layers";
import type { CameraModel } from "../spatial/camera-geometry/camera-model";

const PROJECTION_PICK_RADIUS_SCREEN_PX = 6;
const PROJECTION_HOVER_OWNER = "image-projection";

/**
 * DOM interaction surface for pointcloud projections. Rendering and hit
 * testing live in the image's R3F scene; this component owns only dwell
 * timing, coordinate conversion, tooltip UI, and cross-pane hover state.
 */
const ImageProjectionOverlay = ({
  cameraFrameId,
  cameraModel,
  fit,
  imageHeight,
  imageContentTimeNs,
  imageStream,
  imageWidth,
  layers,
  pickerRef,
  pointSize,
  sourceKey,
  viewTransform,
}: {
  readonly cameraFrameId: string;
  readonly cameraModel: CameraModel;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageContentTimeNs: bigint;
  readonly imageStream: string;
  readonly imageWidth: number;
  readonly layers: readonly ImageProjectionLayer[];
  readonly pickerRef: RefObject<GpuPointCloudProjectionPickerHandle>;
  readonly pointSize: number;
  readonly sourceKey: string;
  readonly viewTransform?: ImageViewTransform;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dwellTooltip, setDwellTooltip] =
    useState<Scene3dHoverTooltipState | null>(null);
  const hoverPublisher = useOwnedHoverEchoPublisher<string>();
  const requestGenerationRef = useRef(0);

  // Mutable render inputs are read again when an asynchronous pick resolves.
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

  const clearOwnHover = useCallback(() => {
    // Pointer cancellation cannot cancel mapAsync itself. Bump both the DOM
    // generation and picker generation so a late result is inert.
    requestGenerationRef.current += 1;
    pickerRef.current?.invalidate();
    setDwellTooltip(null);
    hoverPublisher.retract(PROJECTION_HOVER_OWNER);
  }, [hoverPublisher, pickerRef]);

  // This effect clears a frame-scoped projection hover when either its image
  // frame or point resource leaves the tile.
  useEffect(() => {
    hoverPublisher.retire((_owner, published) => {
      if (published.kind !== "point") return false;
      const source = published.source;
      if (source?.kind !== "image-projection") return false;
      const imageStillCurrent =
        source.cameraFrameId === cameraFrameId &&
        source.imageContentTimeNs === imageContentTimeNs &&
        source.imageStream === imageStream;
      const pointStillCurrent = layers.some(
        (layer) =>
          layer.stream === published.stream &&
          layer.contentTimeNs === published.contentTimeNs,
      );
      const shouldRetire = !imageStillCurrent || !pointStillCurrent;
      if (shouldRetire) {
        // Keep invalidation ahead of shared-state retraction, matching pointer
        // cancellation and making late picker results inert before publication.
        requestGenerationRef.current += 1;
        pickerRef.current?.invalidate();
        setDwellTooltip(null);
      }
      return shouldRetire;
    });
  }, [
    cameraFrameId,
    hoverPublisher,
    imageContentTimeNs,
    imageStream,
    layers,
    pickerRef,
  ]);

  // This effect owns pointer-based GPU picking for the projection overlay.
  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) {
      return undefined;
    }

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
          // stream order or playback content may change while readback waits.
          const currentLayers = layersRef.current;
          const layer = currentLayers.find(
            (candidate) =>
              gpuPointCloudProjectionResourceKey(
                sourceKeyRef.current,
                candidate.stream,
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
          const tooltip = hoveredPointForFrame(
            layer.stream,
            layer.frame,
            pointIndex,
            pick.sampleIndex,
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

          setDwellTooltip({
            ...tooltip,
            color,
            sourceLabel: layer.sourceLabel,
            sourceName: layer.sourceName,
            x: pointerX,
            y: pointerY,
          });
          const hover: HoverEcho = {
            color,
            contentTimeNs: layer.contentTimeNs,
            fields: tooltip.fields,
            ...(tooltip.frameId ? { frameId: tooltip.frameId } : {}),
            kind: "point",
            pointIndex,
            position: tooltip.position,
            source: {
              cameraFrameId,
              imageContentTimeNs,
              imageStream,
              kind: "image-projection",
            },
            sourceLabel: layer.sourceLabel,
            sourceName: layer.sourceName,
            stream: layer.stream,
          };
          hoverPublisher.publish(PROJECTION_HOVER_OWNER, hover);
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
  }, [
    cameraFrameId,
    clearOwnHover,
    imageContentTimeNs,
    imageStream,
    hoverPublisher,
    pickerRef,
  ]);

  return (
    <div
      data-episode-image-projection-overlay
      ref={containerRef}
      style={containerStyle}
    >
      {dwellTooltip ? <Scene3dHoverTooltip tooltip={dwellTooltip} /> : null}
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

export default ImageProjectionOverlay;
