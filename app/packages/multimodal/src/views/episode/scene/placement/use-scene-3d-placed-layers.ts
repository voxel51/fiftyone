import { useMemo } from "react";

import type {
  CameraCalibrationVisualization,
  GridVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../../../ir";
import {
  isVisualizationCostObserved,
  recordVisualizationCost,
  visualizationCostNowMs,
} from "../../../../observability/visualization-cost";
import type {
  StreamContentFrame,
  StreamPlaybackFrame,
} from "../../playback/use-stream-values";
import type { FrameTransformsState } from "../../spatial/frame-transforms/use-frame-transforms";
import {
  build3dLayers,
  type Scene3dLayerBuildResult,
} from "../entities/scene-3d-layers";
import { useScene3dPlacementStream } from "./use-scene-3d-placement-stream";

/** Unique coordinate frames whose placement gates point-cloud playback. */
export function pointCloudPlacementFrameIds(
  frames: readonly (StreamContentFrame<PointCloudVisualization> | null)[],
): readonly string[] {
  return Array.from(
    new Set(
      frames
        .map((frame) => frame?.frame.coordinateFrameId)
        .filter((frameId): frameId is string => Boolean(frameId)),
    ),
  );
}

/** Resolves render layers and registers their transform-placement readiness. */
export function useScene3dPlacedLayers({
  annotationFrames,
  annotationStreams,
  calibrationFrames,
  calibrationStreams,
  frameTransforms,
  frames,
  gridFrames,
  gridStreams,
  playbackTimeNs,
  pointCloudStreams,
  provisionalStreamId,
  tileId,
  worldFrameId,
}: {
  readonly annotationFrames: readonly (StreamPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly annotationStreams: readonly string[];
  readonly calibrationFrames: readonly (StreamPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly calibrationStreams: readonly string[];
  readonly frameTransforms: FrameTransformsState;
  readonly frames: readonly (StreamContentFrame<PointCloudVisualization> | null)[];
  readonly gridFrames: readonly (StreamPlaybackFrame<GridVisualization> | null)[];
  readonly gridStreams: readonly string[];
  readonly playbackTimeNs?: bigint;
  readonly pointCloudStreams: readonly string[];
  readonly provisionalStreamId: string | null;
  readonly tileId: string | null | undefined;
  readonly worldFrameId: string;
}): Scene3dLayerBuildResult & {
  readonly placementReadiness: ReturnType<typeof useScene3dPlacementStream>;
} {
  const layers = useMemo(
    () =>
      build3dLayers({
        annotationFrames,
        calibrationFrames,
        frameTransforms,
        frames,
        gridFrames,
        provisionalStreamId,
        selectedAnnotationStreams: annotationStreams,
        selectedCalibrationStreams: calibrationStreams,
        selectedGridStreams: gridStreams,
        selectedStreams: pointCloudStreams,
        worldFrameId,
      }),
    [
      annotationFrames,
      annotationStreams,
      calibrationFrames,
      calibrationStreams,
      frameTransforms,
      frames,
      gridFrames,
      gridStreams,
      pointCloudStreams,
      provisionalStreamId,
      worldFrameId,
    ],
  );
  const placementFrameIds = useMemo(
    () => pointCloudPlacementFrameIds(frames),
    [frames],
  );
  const placementReadiness = useScene3dPlacementStream({
    active: pointCloudStreams.length > 0,
    frameIds: placementFrameIds,
    frameTransforms,
    playbackTimeNs,
    streamId: `episode-3d-placement:${tileId ?? "default"}`,
    worldFrameId,
  });

  return useMemo(
    () => ({ ...layers, placementReadiness }),
    [layers, placementReadiness],
  );
}
