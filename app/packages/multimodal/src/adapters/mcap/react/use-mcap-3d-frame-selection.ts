import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

// Auto-selected world-frame defaults, most-preferred first. Ego-centric frames
// keep local sensor geometry stable by default; users can opt into map/world
// frames when they want global motion. These are soft heuristics on frame
// *names* (not topic/schema names): if none are present the selection falls
// back to whatever frames the data exposes.
const PREFERRED_WORLD_FRAMES = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
  "map",
  "world",
  "odom",
];
const PREFERRED_CAMERA_TARGET_FRAMES = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
];
export type FrameSelectionSource = "auto" | "user";

/**
 * World-frame and camera-target frame selection for the 3D tile. Derives
 * the available frame ids from the transform graph plus the current playback
 * frames, auto-fills both selections from preferred defaults, and lets the
 * user's explicit choice stick while its frame remains available. State is
 * local to the calling tile — it resets when the tile remounts.
 */
export function useMcap3dFrameSelection({
  annotationFrames,
  calibrationFrames,
  frames,
  frameTransforms,
  gridFrames,
}: {
  readonly annotationFrames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly calibrationFrames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly gridFrames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[];
}) {
  const [worldFrameId, setWorldFrameId] = useState("");
  const [cameraTargetFrameId, setCameraTargetFrameId] = useState("");
  const [worldFrameSelectionSource, setWorldFrameSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const [cameraTargetSelectionSource, setCameraTargetSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const frameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameTransforms.frameIds,
        ...frameIdsFromFrames(frames),
        ...frameIdsFromGridFrames(gridFrames),
        ...frameIdsFromCalibrationFrames(calibrationFrames),
        ...frameIdsFromSceneAnnotationFrames(annotationFrames),
      ]),
    [
      annotationFrames,
      calibrationFrames,
      frameTransforms.frameIds,
      frames,
      gridFrames,
    ],
  );

  // This effect keeps the world frame on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setWorldFrameId((current) =>
      nextFrameSelection({
        allowFallback: frameTransforms.frameIds.length > 0,
        current,
        frameIds,
        preferred: PREFERRED_WORLD_FRAMES,
        selectionSource: worldFrameSelectionSource,
      }),
    );
  }, [frameIds, frameTransforms.frameIds.length, worldFrameSelectionSource]);

  // This effect keeps the camera target on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setCameraTargetFrameId((current) =>
      nextFrameSelection({
        allowFallback: frameTransforms.frameIds.length > 0,
        current,
        frameIds,
        preferred: [...PREFERRED_CAMERA_TARGET_FRAMES, worldFrameId],
        selectionSource: cameraTargetSelectionSource,
      }),
    );
  }, [
    cameraTargetSelectionSource,
    frameIds,
    frameTransforms.frameIds.length,
    worldFrameId,
  ]);

  const updateWorldFrameId = useCallback((frameId: string) => {
    setWorldFrameSelectionSource("user");
    setWorldFrameId(frameId);
  }, []);
  const updateCameraTargetFrameId = useCallback((frameId: string) => {
    setCameraTargetSelectionSource("user");
    setCameraTargetFrameId(frameId);
  }, []);

  return {
    cameraTargetFrameId,
    cameraTargetSelectionSource,
    frameIds,
    updateCameraTargetFrameId,
    updateWorldFrameId,
    worldFrameId,
    worldFrameSelectionSource,
  };
}

function frameIdsFromFrames(
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromGridFrames(
  frames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromCalibrationFrames(
  frames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromSceneAnnotationFrames(
  frames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    for (const entity of playbackFrame.frame.entities) {
      pushFrameId(frameIds, entity.frameId);
    }
  }

  return frameIds;
}

function pushFrameId(frameIds: string[], frameId: string | undefined) {
  const normalized = frameId?.trim();
  if (normalized) {
    frameIds.push(normalized);
  }
}

function uniqueSortedFrameIds(frameIds: readonly string[]): readonly string[] {
  return [...new Set(frameIds.map((id) => id.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function nextFrameSelection({
  allowFallback = true,
  current,
  frameIds,
  preferred,
  selectionSource,
}: {
  readonly allowFallback?: boolean;
  readonly current: string;
  readonly frameIds: readonly string[];
  readonly preferred: readonly string[];
  readonly selectionSource: FrameSelectionSource;
}) {
  if (selectionSource === "user" && current && frameIds.includes(current)) {
    return current;
  }

  for (const frameId of preferred) {
    if (frameId && frameIds.includes(frameId)) {
      return frameId;
    }
  }

  if (current && frameIds.includes(current)) {
    return current;
  }

  return allowFallback ? (frameIds[0] ?? "") : "";
}
