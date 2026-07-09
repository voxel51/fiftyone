import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type {
  CameraCalibrationVisualization,
  PointCloudVisualization,
} from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/panels/base-2d-scene";
import {
  POINT_HOVER_DWELL_MS,
  POINT_HOVER_MOVE_TOLERANCE_PX,
} from "../../../visualization/panels/hover-inspect";
import { attachPointerDwell } from "../../../visualization/panels/pointer-dwell";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../../visualization/panels/style-tokens";
import {
  complementaryRgbUnit,
  createPointCloudColorWriter,
  DEFAULT_POINT_SIZE,
  type PointCloudColorOptions,
} from "../../../visualization/panels/point-cloud";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  drawProjectedPoints,
  hasNonTrivialDistortion,
  pickProjectedPoint,
  projectPointCloudToImage,
} from "./mcap-image-projection";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import {
  useMcapHoverEcho,
  useSetMcapHoverEcho,
  type McapHoverEcho,
} from "./mcap-hover-echo";
import { mcapHoveredPointForFrame } from "./mcap-point-hover";
import {
  defaultMcapPointCloudColorForSource,
  useMcapPointCloudStyleSettings,
} from "./mcap-modal-settings";
import {
  Mcap3dHoverTooltip,
  type Mcap3dHoverTooltipState,
} from "./use-mcap-3d-hover-tooltip";
import { useMcapTopicPlaybackFrames } from "./use-mcap-topic-stream";

// Offscreen scene resolution cap: the projection draws once at (capped)
// calibration resolution and pan/zoom only re-blits, so zooming costs one
// drawImage instead of re-projecting the cloud.
const MAX_OFFSCREEN_DIMENSION_PX = 2_048;
// Backing-store DPR cap for the visible canvas.
const MAX_CANVAS_DPR = 2;
// Hover echo: the projected dot of the 3D-hovered point grows by 10% in
// its complementary color, easing in over a short beat. Sized in screen
// pixels with a floor so the intersected dot reads clearly at any zoom.
const HOVER_ECHO_GROWTH = 1.1;
const HOVER_ECHO_ANIMATION_MS = 150;
const HOVER_ECHO_MIN_SCREEN_PX = 8;
// Dwell hit-test radius around the pointer, in CSS pixels (matches the
// 3D side's POINT_PICK_RADIUS_PX).
const PROJECTION_PICK_RADIUS_SCREEN_PX = 6;

interface ProjectionHoverEcho {
  readonly color: string;
  /** Dot edge length as a fraction of the displayed image width. */
  readonly sizeNorm: number;
  /** Projected position, normalized to the calibrated image. */
  readonly x: number;
  readonly y: number;
}

/**
 * Pointcloud projections for image tiles: projects the selected clouds
 * through /tf into the camera frame, applies the rectified projection
 * (`P`, falling back to pinhole `K`), and draws the surviving points
 * between the image and its annotation layer. Every cloud renders with
 * its 3D colour settings, so both views read identically; dot size is
 * the tile's own projection setting.
 *
 * Structured as project-once + blit-many: point projection re-runs only
 * when a cloud frame, the calibration, the transform state, or the
 * cloud styling changes; pan/zoom/resize just re-blit the offscreen
 * scene. Cloud subscriptions live here, so an unmounted (toggled-off)
 * overlay costs zero reads.
 */
const McapImageProjectionOverlay: React.FC<{
  readonly calibration: CameraCalibrationVisualization;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  /** Projected-dot size, on the same scale as the 3D point size. */
  readonly pointSize: number;
  readonly topics: readonly string[];
  readonly viewTransform?: ImageViewTransform;
}> = ({
  calibration,
  fit,
  imageHeight,
  imageWidth,
  pointSize,
  topics,
  viewTransform,
}) => {
  const frames = useMcapTopicPlaybackFrames<PointCloudVisualization>(topics);
  const { resolve } = useMcapFrameTransformsContext();
  const sharedHover = useMcapHoverEcho();
  const hoveredPoint = sharedHover?.kind === "point" ? sharedHover : null;
  const setSharedHover = useSetMcapHoverEcho();
  const pointCloudSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const { pointCloudColors } = useMcapPointCloudStyleSettings();
  // Per-topic colour options resolved exactly like the 3D tile resolves
  // them: per-source defaults overlaid with the user's stored choices.
  const colorOptionsByTopic = useMemo(() => {
    const optionsByTopic = new Map<string, PointCloudColorOptions>();
    for (const topic of topics) {
      const source = pointCloudSources.find(
        (candidate) => candidate.id === topic,
      ) ?? { id: topic, label: topic };
      const settings = {
        ...defaultMcapPointCloudColorForSource(source, pointCloudSources),
        ...pointCloudColors[topic],
      };
      optionsByTopic.set(topic, {
        colorBy: settings.colorBy,
        colormap: settings.colormap,
        ...(settings.rangeMax !== null ? { rangeMax: settings.rangeMax } : {}),
        ...(settings.rangeMin !== null ? { rangeMin: settings.rangeMin } : {}),
        uniformColor: settings.uniformColor,
      });
    }
    return optionsByTopic;
  }, [pointCloudColors, pointCloudSources, topics]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [hoverEcho, setHoverEcho] = useState<ProjectionHoverEcho | null>(null);
  const [hoverEchoScale, setHoverEchoScale] = useState(1);
  const [dwellTooltip, setDwellTooltip] =
    useState<Mcap3dHoverTooltipState | null>(null);

  // Latest-value refs so the dwell listener binds once to the image
  // surface instead of rebinding per playback tick (a rebind would reset
  // the dwell timer, starving inspection during playback).
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
  const viewTransformRef = useRef(viewTransform);
  viewTransformRef.current = viewTransform;
  const imageDimsRef = useRef({ height: imageHeight, width: imageWidth });
  imageDimsRef.current = { height: imageHeight, width: imageWidth };
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const colorOptionsRef = useRef(colorOptionsByTopic);
  colorOptionsRef.current = colorOptionsByTopic;
  const pointSizeRef = useRef(pointSize);
  pointSizeRef.current = pointSize;
  // Identity of the echo this overlay published, so canceling never
  // clobbers a hover another pane owns.
  const publishedHoverRef = useRef<McapHoverEcho | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ height, width });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Listen on the parent because the overlay itself is pointer-transparent.
  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) {
      return undefined;
    }
    const clearOwnHover = () => {
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
      const calib = calibrationRef.current;
      const cameraFrameId = calib.coordinateFrameId;
      if (!container || !cameraFrameId || !(calib.width > 0)) {
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
      // Pick radius in screen px (at least the drawn dot's screen size),
      // converted into calibration pixels for the hit test.
      const dotSizeCalib = projectionDotSize(calib.width, pointSizeRef.current);
      const screenPxPerCalibPx = rect.width / calib.width;
      const radiusPx =
        Math.max(
          PROJECTION_PICK_RADIUS_SCREEN_PX,
          dotSizeCalib * screenPxPerCalibPx,
        ) / screenPxPerCalibPx;

      const currentTopics = topicsRef.current;
      const currentFrames = framesRef.current;
      let best: {
        distanceSq: number;
        frame: PointCloudVisualization;
        pointIndex: number;
        topic: string;
      } | null = null;
      for (const [topicIndex, topic] of currentTopics.entries()) {
        const playbackFrame = currentFrames[topicIndex];
        const frame = playbackFrame?.frame;
        const lidarFrameId = frame?.coordinateFrameId;
        if (!frame || !lidarFrameId) {
          continue;
        }
        const resolution = resolveRef.current(
          lidarFrameId,
          cameraFrameId,
          playbackFrame.contentTimeNs,
        );
        if (resolution.status !== "resolved") {
          continue;
        }
        const pick = pickProjectedPoint({
          calibration: calib,
          positions: frame.positions,
          radiusPx,
          rotation: resolution.transform.rotation,
          targetU,
          targetV,
          translation: resolution.transform.translation,
        });
        if (pick && (!best || pick.distanceSq < best.distanceSq)) {
          best = {
            distanceSq: pick.distanceSq,
            frame,
            pointIndex: pick.pointIndex,
            topic,
          };
        }
      }
      if (!best) {
        clearOwnHover();
        return;
      }
      const payload = mcapHoveredPointForFrame(
        best.topic,
        best.frame,
        best.pointIndex,
      );
      if (!payload) {
        clearOwnHover();
        return;
      }
      setDwellTooltip({ ...payload, x: pointerX, y: pointerY });
      // Use the dot's rendered color for matching emphasis across panes.
      const scratch = new Float32Array(3);
      createPointCloudColorWriter(best.frame.positions, {
        ...colorOptionsRef.current.get(best.topic),
        colors: best.frame.colors,
        scalarFields: best.frame.scalarFields,
      }).write(
        scratch,
        0,
        best.pointIndex,
        best.frame.positions[best.pointIndex * 3 + 2],
      );
      const hover: McapHoverEcho = {
        color: [scratch[0], scratch[1], scratch[2]],
        kind: "point",
        pointIndex: payload.pointIndex,
        position: payload.position,
        topic: best.topic,
      };
      publishedHoverRef.current = hover;
      setSharedHover(hover);
    };

    return attachPointerDwell(surface, {
      dwellMs: POINT_HOVER_DWELL_MS,
      moveTolerancePx: POINT_HOVER_MOVE_TOLERANCE_PX,
      onCancel: clearOwnHover,
      onDwell: pickAt,
    });
  }, [setSharedHover]);

  // Projection redraws only when scene data or styling changes.
  useEffect(() => {
    const cameraFrameId = calibration.coordinateFrameId;
    if (
      !cameraFrameId ||
      !(calibration.width > 0) ||
      !(calibration.height > 0)
    ) {
      offscreenRef.current = null;
      setSceneVersion((version) => version + 1);
      return;
    }
    const offscreenScale = Math.min(
      1,
      MAX_OFFSCREEN_DIMENSION_PX /
        Math.max(calibration.width, calibration.height),
    );
    const offscreen = (offscreenRef.current ??=
      document.createElement("canvas"));
    const offscreenWidth = Math.max(
      1,
      Math.round(calibration.width * offscreenScale),
    );
    const offscreenHeight = Math.max(
      1,
      Math.round(calibration.height * offscreenScale),
    );
    if (
      offscreen.width !== offscreenWidth ||
      offscreen.height !== offscreenHeight
    ) {
      offscreen.width = offscreenWidth;
      offscreen.height = offscreenHeight;
    }
    const context = offscreen.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, offscreen.width, offscreen.height);
    const dotSize = projectionDotSize(calibration.width, pointSize);
    for (const [topicIndex, playbackFrame] of frames.entries()) {
      const frame = playbackFrame?.frame;
      const lidarFrameId = frame?.coordinateFrameId;
      const topic = topics[topicIndex];
      if (!frame || !lidarFrameId || !topic) {
        continue;
      }
      // Resolve at the cloud message's capture time — the moment the
      // points were measured — matching the 3D scene's placement policy.
      const resolution = resolve(
        lidarFrameId,
        cameraFrameId,
        playbackFrame.contentTimeNs,
      );
      if (resolution.status !== "resolved") {
        // Pending/missing transforms draw nothing: a provisional overlay
        // on an image reads as a calibration bug.
        continue;
      }
      const projection = projectPointCloudToImage({
        calibration,
        // The cloud's own 3D styling colours its projected dots.
        colorWriter: createPointCloudColorWriter(frame.positions, {
          ...colorOptionsByTopic.get(topic),
          colors: frame.colors,
          scalarFields: frame.scalarFields,
        }),
        positions: frame.positions,
        rotation: resolution.transform.rotation,
        translation: resolution.transform.translation,
      });
      if (!projection) {
        continue;
      }
      context.save();
      context.scale(offscreenScale, offscreenScale);
      drawProjectedPoints(context, projection, { dotSize });
      context.restore();
    }
    setSceneVersion((version) => version + 1);
  }, [calibration, colorOptionsByTopic, frames, pointSize, resolve, topics]);

  // Project hover emphasis separately from the full cloud.
  useEffect(() => {
    const cameraFrameId = calibration.coordinateFrameId;
    const topicIndex = hoveredPoint ? topics.indexOf(hoveredPoint.topic) : -1;
    if (
      !hoveredPoint ||
      topicIndex < 0 ||
      !cameraFrameId ||
      !(calibration.width > 0) ||
      !(calibration.height > 0)
    ) {
      setHoverEcho(null);
      return;
    }
    const playbackFrame = frames[topicIndex];
    const frame = playbackFrame?.frame;
    const lidarFrameId = frame?.coordinateFrameId;
    if (!frame || !lidarFrameId) {
      setHoverEcho(null);
      return;
    }
    const resolution = resolve(
      lidarFrameId,
      cameraFrameId,
      playbackFrame.contentTimeNs,
    );
    if (resolution.status !== "resolved") {
      setHoverEcho(null);
      return;
    }
    const projection = projectPointCloudToImage({
      calibration,
      positions: Float32Array.from(hoveredPoint.position),
      rotation: resolution.transform.rotation,
      translation: resolution.transform.translation,
    });
    if (!projection) {
      setHoverEcho(null);
      return;
    }
    // The echo complements the point's rendered colour, carried on the
    // hover itself (both the 3D raycast and the 2D pick publish it).
    const [r, g, b] = hoveredPoint.color
      ? complementaryRgbUnit(hoveredPoint.color)
      : [1, 1, 1];
    const dotSize = projectionDotSize(calibration.width, pointSize);
    setHoverEcho({
      color: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
        b * 255,
      )})`,
      sizeNorm: dotSize / calibration.width,
      x: projection.uv[0] / calibration.width,
      y: projection.uv[1] / calibration.height,
    });
  }, [calibration, frames, hoveredPoint, pointSize, resolve, topics]);

  useEffect(() => {
    if (!hoverEcho) {
      return undefined;
    }
    let rafHandle = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(
        1,
        (performance.now() - start) / HOVER_ECHO_ANIMATION_MS,
      );
      const eased = 1 - (1 - t) ** 3;
      setHoverEchoScale(1 + (HOVER_ECHO_GROWTH - 1) * eased);
      if (t < 1) {
        rafHandle = requestAnimationFrame(tick);
      }
    };
    setHoverEchoScale(1);
    rafHandle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafHandle);
  }, [hoverEcho]);

  // Pan, zoom, and resize only blit the cached projection.
  useEffect(() => {
    const canvas = canvasRef.current;
    const offscreen = offscreenRef.current;
    if (!canvas || !containerSize) {
      return;
    }
    const dpr = Math.min(
      MAX_CANVAS_DPR,
      Math.max(1, globalThis.devicePixelRatio || 1),
    );
    const backingWidth = Math.max(1, Math.round(containerSize.width * dpr));
    const backingHeight = Math.max(1, Math.round(containerSize.height * dpr));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (
      !offscreen ||
      offscreen.width === 0 ||
      offscreen.height === 0 ||
      imageWidth <= 0 ||
      imageHeight <= 0 ||
      sceneVersion === 0
    ) {
      return;
    }
    const rect = transformedImageDisplayRect(
      imageDisplayRect(
        containerSize,
        { height: imageHeight, width: imageWidth },
        fit,
      ),
      viewTransform,
    );
    context.drawImage(
      offscreen,
      rect.x * dpr,
      rect.y * dpr,
      rect.width * dpr,
      rect.height * dpr,
    );
    if (hoverEcho) {
      const echoX = (rect.x + hoverEcho.x * rect.width) * dpr;
      const echoY = (rect.y + hoverEcho.y * rect.height) * dpr;
      // Track the dot when zoomed in, but never fall below the screen
      // floor — the echo's job is to show exactly where the hover landed.
      const diameter =
        Math.max(hoverEcho.sizeNorm * rect.width, HOVER_ECHO_MIN_SCREEN_PX) *
        dpr *
        hoverEchoScale;
      context.beginPath();
      context.arc(echoX, echoY, diameter / 2, 0, Math.PI * 2);
      context.fillStyle = hoverEcho.color;
      context.fill();
    }
  }, [
    containerSize,
    fit,
    hoverEcho,
    hoverEchoScale,
    imageHeight,
    imageWidth,
    sceneVersion,
    viewTransform,
  ]);

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden>
      <canvas ref={canvasRef} style={canvasStyle} />
      {dwellTooltip ? <Mcap3dHoverTooltip tooltip={dwellTooltip} /> : null}
      {hasNonTrivialDistortion(calibration) ? (
        <div style={noticeStyle}>
          Pointcloud projections assume rectified images
        </div>
      ) : null}
    </div>
  );
};

/**
 * Dot size in calibration pixels: proportional to the image so blits
 * stay valid across zoom, scaled by the tile's projection point-size
 * setting (same scale as the 3D point size).
 */
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

const canvasStyle: CSSProperties = {
  height: "100%",
  left: 0,
  position: "absolute",
  top: 0,
  width: "100%",
};

const noticeStyle: CSSProperties = {
  background: VISUALIZATION_HUD_BACKGROUND_COLOR,
  border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
  borderRadius: 4,
  bottom: 8,
  color: VISUALIZATION_HUD_TEXT_COLOR,
  fontSize: 11,
  left: 8,
  padding: "3px 7px",
  position: "absolute",
};

export default McapImageProjectionOverlay;
