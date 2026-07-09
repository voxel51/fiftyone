import React, { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  CameraCalibrationVisualization,
  PointCloudVisualization,
} from "../../../decoders";
import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/panels/base-2d-scene";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../../visualization/panels/style-tokens";
import {
  drawProjectedPoints,
  hasNonTrivialDistortion,
  projectPointCloudToImage,
} from "./mcap-image-projection";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import type { McapImageProjectionColorBy } from "./mcap-modal-settings";
import { useMcapTopicPlaybackFrames } from "./use-mcap-topic-stream";

// Offscreen scene resolution cap: the projection draws once at (capped)
// calibration resolution and pan/zoom only re-blits, so zooming costs one
// drawImage instead of re-projecting the cloud.
const MAX_OFFSCREEN_DIMENSION_PX = 2_048;
// Backing-store DPR cap for the visible canvas.
const MAX_CANVAS_DPR = 2;
const PROJECTION_COLORMAP = "turbo";

/**
 * Lidar→camera projection overlay for image tiles: projects the selected
 * point clouds through /tf into the camera frame, applies the rectified
 * projection (`P`, falling back to pinhole `K`), and draws the surviving
 * points as colormapped dots between the image and its annotation layer.
 *
 * Structured as project-once + blit-many: point projection re-runs only
 * when a lidar frame, the calibration, the transform state, or the
 * colour source changes; pan/zoom/resize just re-blit the offscreen
 * scene. Cloud subscriptions live here, so an unmounted (toggled-off)
 * overlay costs zero reads.
 */
const McapImageProjectionOverlay: React.FC<{
  readonly calibration: CameraCalibrationVisualization;
  readonly colorBy: McapImageProjectionColorBy;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly topics: readonly string[];
  readonly viewTransform?: ImageViewTransform;
}> = ({
  calibration,
  colorBy,
  fit,
  imageHeight,
  imageWidth,
  topics,
  viewTransform,
}) => {
  const frames = useMcapTopicPlaybackFrames<PointCloudVisualization>(topics);
  const { resolve } = useMcapFrameTransformsContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);

  // This effect tracks the overlay container's size for display-rect math.
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

  // This effect re-projects the clouds and redraws the offscreen scene
  // when a lidar frame, the calibration, transforms, or the colour source
  // change — the expensive half of the overlay, at lidar frame rate.
  useEffect(() => {
    const cameraFrameId = calibration.coordinateFrameId;
    if (
      !cameraFrameId ||
      !(calibration.width > 0) ||
      !(calibration.height > 0)
    ) {
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
    // Dots stay proportional to the source image so the blit keeps them
    // visually stable across camera resolutions.
    const dotSize = Math.max(2, Math.round(calibration.width / 400));
    for (const playbackFrame of frames) {
      const frame = playbackFrame?.frame;
      const lidarFrameId = frame?.coordinateFrameId;
      if (!frame || !lidarFrameId) {
        continue;
      }
      // Resolve at the lidar message's capture time — the moment the
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
        colorValues: colorBy === "intensity" ? intensityChannel(frame) : null,
        positions: frame.positions,
        rotation: resolution.transform.rotation,
        translation: resolution.transform.translation,
      });
      if (!projection) {
        continue;
      }
      context.save();
      context.scale(offscreenScale, offscreenScale);
      drawProjectedPoints(context, projection, {
        colormap: PROJECTION_COLORMAP,
        dotSize,
        // Near returns read warmest — the conventional lidar-overlay look.
        invert: colorBy === "depth",
      });
      context.restore();
    }
    setSceneVersion((version) => version + 1);
  }, [calibration, colorBy, frames, resolve]);

  // This effect blits the offscreen scene onto the visible canvas when
  // the scene, the container geometry, or the pan/zoom transform change —
  // the cheap half, a single drawImage.
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
  }, [
    containerSize,
    fit,
    imageHeight,
    imageWidth,
    sceneVersion,
    viewTransform,
  ]);

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden>
      <canvas ref={canvasRef} style={canvasStyle} />
      {hasNonTrivialDistortion(calibration) ? (
        <div style={noticeStyle}>Lidar overlay assumes rectified images</div>
      ) : null}
    </div>
  );
};

function intensityChannel(frame: PointCloudVisualization): Float32Array | null {
  for (const scalarField of frame.scalarFields ?? []) {
    if (scalarField.name.trim().toLowerCase() === "intensity") {
      return scalarField.values;
    }
  }
  return null;
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
