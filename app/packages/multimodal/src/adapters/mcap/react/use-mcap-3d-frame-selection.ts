import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  nextMcap3dViewStateRestoreOnceKey,
  recordMcap3dUserCameraTargetFrameId,
  recordMcap3dUserWorldFrameId,
} from "./mcap-3d-view-state";
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

export interface Mcap3dFrameSelectionRestore {
  readonly userCameraTargetFrameId: string | null;
  readonly userWorldFrameId: string | null;
}

/**
 * World-frame and camera-target frame selection for the 3D tile. Derives
 * the available frame ids from the transform graph plus the current playback
 * frames, auto-fills both selections from preferred defaults, and lets the
 * user's explicit choice stick while its frame remains available. State is
 * local to the calling tile — it resets when the tile remounts.
 * An optional `restore` carries the previous sample's *user* selections as a
 * pending intent: the auto selection runs untouched while the frame id is
 * absent, and the intent is adopted only if/when the id (re)appears in the
 * streaming inventory — so a stale id can never pin the selection. A manual
 * selection cancels the pending intent.
 */
export function useMcap3dFrameSelection({
  annotationFrames,
  calibrationFrames,
  frames,
  frameTransforms,
  gridFrames,
  restore = null,
}: {
  readonly annotationFrames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly calibrationFrames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly gridFrames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[];
  readonly restore?: Mcap3dFrameSelectionRestore | null;
}) {
  const [worldFrameId, setWorldFrameId] = useState("");
  const [cameraTargetFrameId, setCameraTargetFrameId] = useState("");
  const [worldFrameSelectionSource, setWorldFrameSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const [cameraTargetSelectionSource, setCameraTargetSelectionSource] =
    useState<FrameSelectionSource>("auto");
  // Pending carry-over of the previous sample's user-selected frames,
  // captured once at mount. The intent dies on adoption, on a manual
  // selection, or with the mount itself (next sample hop).
  const pendingUserWorldFrameIdRef = useRef(restore?.userWorldFrameId ?? null);
  const pendingUserCameraTargetFrameIdRef = useRef(
    restore?.userCameraTargetFrameId ?? null,
  );
  const restoreMarkKeyRef = useRef<string | null>(null);
  if (restoreMarkKeyRef.current === null) {
    restoreMarkKeyRef.current = nextMcap3dViewStateRestoreOnceKey();
  }
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

  // This effect adopts the previous sample's user-selected frames once they
  // (re)appear in the streaming frame inventory. Until then the auto
  // selection above runs untouched; if the frame never (re)appears, nothing
  // is ever pinned.
  useEffect(() => {
    const pendingWorld = pendingUserWorldFrameIdRef.current;
    if (mcap3dUserFrameRestoreApplies(pendingWorld, frameIds)) {
      pendingUserWorldFrameIdRef.current = null;
      setWorldFrameSelectionSource("user");
      setWorldFrameId(pendingWorld);
      markMcapLatencyEvent(
        "3d view state restored",
        { field: "worldFrameId", frameId: pendingWorld },
        { onceKey: `${restoreMarkKeyRef.current}:worldFrameId` },
      );
    }

    const pendingTarget = pendingUserCameraTargetFrameIdRef.current;
    if (mcap3dUserFrameRestoreApplies(pendingTarget, frameIds)) {
      pendingUserCameraTargetFrameIdRef.current = null;
      setCameraTargetSelectionSource("user");
      setCameraTargetFrameId(pendingTarget);
      markMcapLatencyEvent(
        "3d view state restored",
        { field: "cameraTargetFrameId", frameId: pendingTarget },
        { onceKey: `${restoreMarkKeyRef.current}:cameraTargetFrameId` },
      );
    }
  }, [frameIds]);

  const updateWorldFrameId = useCallback((frameId: string) => {
    // A manual selection supersedes any pending carried-over user frame and
    // is written through to the session view-state store.
    pendingUserWorldFrameIdRef.current = null;
    recordMcap3dUserWorldFrameId(frameId);
    setWorldFrameSelectionSource("user");
    setWorldFrameId(frameId);
  }, []);
  const updateCameraTargetFrameId = useCallback((frameId: string) => {
    // A manual selection supersedes any pending carried-over user frame and
    // is written through to the session view-state store.
    pendingUserCameraTargetFrameIdRef.current = null;
    recordMcap3dUserCameraTargetFrameId(frameId);
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

/**
 * Pure gate for adopting a carried-over user frame selection: the frame id
 * must currently exist in the streaming frame inventory. "Not yet present"
 * and "absent" are indistinguishable while frames stream in, so the caller
 * keeps the intent pending and re-checks as the inventory grows.
 */
export function mcap3dUserFrameRestoreApplies(
  frameId: string | null,
  frameIds: readonly string[],
): frameId is string {
  return frameId !== null && frameId !== "" && frameIds.includes(frameId);
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
