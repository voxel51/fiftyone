import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type { McapFrameGraphSummary } from "../frame-transforms";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  nextMcap3dViewStateRestoreOnceKey,
  type Mcap3dViewStateStore,
} from "./mcap-3d-view-state";
import { useMcap3dViewStateStore } from "./mcap-3d-view-state-context";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

const STABLE_WORLD_FRAME_IDS = ["map", "world", "odom"] as const;
const EGO_FRAME_IDS = ["base_link", "ego_vehicle", "ego", "vehicle"] as const;
export const PREFERRED_CAMERA_TARGET_FRAMES = EGO_FRAME_IDS;
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
  onPreferredCameraTargetFrameIdChange,
  onPreferredWorldFrameIdChange,
  preferredCameraTargetFrameId = null,
  preferredWorldFrameId = null,
  restore = null,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly annotationFrames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly calibrationFrames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly gridFrames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[];
  readonly onPreferredCameraTargetFrameIdChange?: (frameId: string) => void;
  readonly onPreferredWorldFrameIdChange?: (frameId: string) => void;
  readonly preferredCameraTargetFrameId?: string | null;
  readonly preferredWorldFrameId?: string | null;
  readonly restore?: Mcap3dFrameSelectionRestore | null;
  readonly viewStateStore?: Mcap3dViewStateStore;
}) {
  const viewStateStore = useMcap3dViewStateStore(suppliedViewStateStore);
  const [worldFrameId, setWorldFrameId] = useState("");
  const [cameraTargetFrameId, setCameraTargetFrameId] = useState("");
  const [worldFrameSelectionSource, setWorldFrameSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const [cameraTargetSelectionSource, setCameraTargetSelectionSource] =
    useState<FrameSelectionSource>("auto");
  // Pending carry-over of the previous sample's user-selected frames,
  // captured once at mount. The intent dies on adoption, on a manual
  // selection, or with the mount itself (next sample hop).
  const pendingUserWorldFrameIdRef = useRef(
    restore?.userWorldFrameId ?? preferredWorldFrameId,
  );
  const pendingUserCameraTargetFrameIdRef = useRef(
    restore?.userCameraTargetFrameId ?? preferredCameraTargetFrameId,
  );
  const restoreMarkKeyRef = useRef<string | null>(null);
  if (restoreMarkKeyRef.current === null) {
    restoreMarkKeyRef.current = nextMcap3dViewStateRestoreOnceKey();
  }
  const dataBearingFrameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameIdsFromCoordinateFrames(frames),
        ...frameIdsFromCoordinateFrames(gridFrames),
        ...frameIdsFromCoordinateFrames(calibrationFrames),
        ...frameIdsFromSceneAnnotationFrames(annotationFrames),
      ]),
    [annotationFrames, calibrationFrames, frames, gridFrames],
  );
  const frameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameTransforms.frameIds,
        ...dataBearingFrameIds,
      ]),
    [dataBearingFrameIds, frameTransforms.frameIds],
  );
  const graphSummary = useMemo(
    () => frameTransforms.summarizeGraph(new Set(dataBearingFrameIds)),
    [dataBearingFrameIds, frameTransforms],
  );

  // This effect keeps the world frame on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setWorldFrameId((current) =>
      nextWorldFrameSelection({
        current,
        frameIds,
        graphSummary,
        selectionSource: worldFrameSelectionSource,
      }),
    );
  }, [frameIds, graphSummary, worldFrameSelectionSource]);

  // This effect keeps the camera target on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setCameraTargetFrameId((current) =>
      nextCameraTargetFrameSelection({
        current,
        frameIds,
        graphSummary,
        selectionSource: cameraTargetSelectionSource,
        worldFrameId,
      }),
    );
  }, [cameraTargetSelectionSource, frameIds, graphSummary, worldFrameId]);

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

  const updateWorldFrameId = useCallback(
    (frameId: string) => {
      // A manual selection supersedes any pending carried-over user frame and
      // is written through to the session view-state store.
      pendingUserWorldFrameIdRef.current = null;
      viewStateStore.recordUserWorldFrameId(frameId);
      onPreferredWorldFrameIdChange?.(frameId);
      setWorldFrameSelectionSource("user");
      setWorldFrameId(frameId);
    },
    [onPreferredWorldFrameIdChange, viewStateStore],
  );
  const updateCameraTargetFrameId = useCallback(
    (frameId: string) => {
      // A manual selection supersedes any pending carried-over user frame and
      // is written through to the session view-state store.
      pendingUserCameraTargetFrameIdRef.current = null;
      viewStateStore.recordUserCameraTargetFrameId(frameId);
      onPreferredCameraTargetFrameIdChange?.(frameId);
      setCameraTargetSelectionSource("user");
      setCameraTargetFrameId(frameId);
    },
    [onPreferredCameraTargetFrameIdChange, viewStateStore],
  );

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

type CoordinateFrameVisualization = {
  readonly coordinateFrameId?: string;
};

function frameIdsFromCoordinateFrames<
  Frame extends CoordinateFrameVisualization,
>(
  frames: readonly (McapTopicPlaybackFrame<Frame> | null)[],
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
    compareFrameIds,
  );
}

function nextWorldFrameSelection({
  current,
  frameIds,
  graphSummary,
  selectionSource,
}: {
  readonly current: string;
  readonly frameIds: readonly string[];
  readonly graphSummary: McapFrameGraphSummary;
  readonly selectionSource: FrameSelectionSource;
}) {
  if (selectionSource === "user" && current && frameIds.includes(current)) {
    return current;
  }

  const tfWorldCandidateFrameIds = worldCandidateFrameIds(
    graphSummary.tfConnectedFrameIds,
  );
  const stableWorldFrameId =
    firstExactPreferredFrameId(
      tfWorldCandidateFrameIds,
      STABLE_WORLD_FRAME_IDS,
    ) ||
    uniqueSuffixPreferredFrameId(
      tfWorldCandidateFrameIds,
      STABLE_WORLD_FRAME_IDS,
    );
  if (stableWorldFrameId) {
    return stableWorldFrameId;
  }

  const graphWorldFrameId = graphDerivedWorldFrameId({
    candidateFrameIds: tfWorldCandidateFrameIds,
    graphSummary,
  });
  if (graphWorldFrameId) {
    return graphWorldFrameId;
  }

  const egoWorldFrameId =
    firstExactPreferredFrameId(tfWorldCandidateFrameIds, EGO_FRAME_IDS) ||
    uniqueSuffixPreferredFrameId(tfWorldCandidateFrameIds, EGO_FRAME_IDS);
  if (egoWorldFrameId) {
    return egoWorldFrameId;
  }

  return tfWorldCandidateFrameIds[0] ?? "";
}

function nextCameraTargetFrameSelection({
  current,
  frameIds,
  graphSummary,
  selectionSource,
  worldFrameId,
}: {
  readonly current: string;
  readonly frameIds: readonly string[];
  readonly graphSummary: McapFrameGraphSummary;
  readonly selectionSource: FrameSelectionSource;
  readonly worldFrameId: string;
}) {
  if (selectionSource === "user" && current && frameIds.includes(current)) {
    return current;
  }

  const targetCandidateFrameIds =
    graphSummary.tfConnectedFrameIds.length > 0
      ? graphSummary.tfConnectedFrameIds
      : frameIds;
  const egoFrameId =
    firstExactPreferredFrameId(targetCandidateFrameIds, EGO_FRAME_IDS) ||
    uniqueSuffixPreferredFrameId(targetCandidateFrameIds, EGO_FRAME_IDS);
  if (egoFrameId) {
    return egoFrameId;
  }

  return worldFrameId && frameIds.includes(worldFrameId) ? worldFrameId : "";
}

function worldCandidateFrameIds(
  tfConnectedFrameIds: readonly string[],
): readonly string[] {
  const sortedFrameIds = uniqueSortedFrameIds(tfConnectedFrameIds);
  const nonOpticalFrameIds = sortedFrameIds.filter(
    (frameId) => !isOpticalFrameId(frameId),
  );

  return nonOpticalFrameIds.length > 0 ? nonOpticalFrameIds : sortedFrameIds;
}

function graphDerivedWorldFrameId({
  candidateFrameIds,
  graphSummary,
}: {
  readonly candidateFrameIds: readonly string[];
  readonly graphSummary: McapFrameGraphSummary;
}) {
  if (candidateFrameIds.length === 0) {
    return "";
  }

  const candidateFrameIdSet = new Set(candidateFrameIds);
  const rootCandidates = graphSummary.roots.filter((frameId) =>
    candidateFrameIdSet.has(frameId),
  );
  if (rootCandidates.length > 0) {
    return highestReachabilityFrameId(rootCandidates, graphSummary);
  }

  const maxDataBearingReachability = Math.max(
    ...candidateFrameIds.map((frameId) =>
      graphReachableCount(
        graphSummary.dataBearingReachableCountsByFrameId,
        frameId,
      ),
    ),
  );
  if (maxDataBearingReachability <= 0) {
    return "";
  }

  return highestReachabilityFrameId(
    candidateFrameIds.filter(
      (frameId) =>
        graphReachableCount(
          graphSummary.dataBearingReachableCountsByFrameId,
          frameId,
        ) === maxDataBearingReachability,
    ),
    graphSummary,
  );
}

function highestReachabilityFrameId(
  frameIds: readonly string[],
  graphSummary: McapFrameGraphSummary,
) {
  return [...frameIds].sort((left, right) => {
    const dataBearingOrder =
      graphReachableCount(
        graphSummary.dataBearingReachableCountsByFrameId,
        right,
      ) -
      graphReachableCount(
        graphSummary.dataBearingReachableCountsByFrameId,
        left,
      );
    if (dataBearingOrder !== 0) {
      return dataBearingOrder;
    }

    const reachableOrder =
      graphReachableCount(graphSummary.reachableCountsByFrameId, right) -
      graphReachableCount(graphSummary.reachableCountsByFrameId, left);
    return reachableOrder === 0 ? compareFrameIds(left, right) : reachableOrder;
  })[0];
}

function graphReachableCount(
  countsByFrameId: ReadonlyMap<string, number>,
  frameId: string,
) {
  return countsByFrameId.get(frameId) ?? 0;
}

function firstExactPreferredFrameId(
  frameIds: readonly string[],
  preferredFrameIds: readonly string[],
) {
  for (const preferredFrameId of preferredFrameIds) {
    if (frameIds.includes(preferredFrameId)) {
      return preferredFrameId;
    }
  }

  return "";
}

function uniqueSuffixPreferredFrameId(
  frameIds: readonly string[],
  preferredFrameIds: readonly string[],
) {
  for (const preferredFrameId of preferredFrameIds) {
    const suffix = `/${preferredFrameId}`;
    const matches = frameIds.filter(
      (frameId) => frameId !== preferredFrameId && frameId.endsWith(suffix),
    );
    if (matches.length === 1) {
      return matches[0] ?? "";
    }
  }

  return "";
}

function isOpticalFrameId(frameId: string) {
  return frameId.toLowerCase().includes("optical");
}

function compareFrameIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
