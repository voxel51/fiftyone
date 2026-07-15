import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  CameraCalibrationVisualization,
  GridVisualization,
  PointCloudVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type { Mcap3dViewStateStore } from "./mcap-3d-view-state";
import { useMcap3dViewStateStore } from "./mcap-3d-view-state-context";
import {
  chooseMcapCameraTarget,
  createMcapReferenceSelectionState,
  mcapReferenceSelectionReducer,
  type McapFrameObservation,
  type McapReferenceSelectionSource,
  type McapReferenceTransition,
} from "./mcap-3d-reference-selection";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

/** Frame names considered ego-centric automatic camera targets, in priority order. */
export const PREFERRED_CAMERA_TARGET_FRAMES = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
] as const;

/** Whether a rendered frame choice was automatic or explicitly selected. */
export type FrameSelectionSource = "auto" | "user";

/** User frame choices eligible to carry across a compatible sample change. */
export interface Mcap3dFrameSelectionRestore {
  readonly userCameraTargetFrameId: string | null;
  readonly userWorldFrameId: string | null;
}

/** Scene-authoritative reference controls consumed by secondary 3D tiles. */
export interface Mcap3dReferenceAuthority {
  readonly activeComponentFrameIds: readonly string[];
  readonly omittedFrameIds: readonly string[];
  readonly omittedSourceIds: readonly string[];
  readonly referenceTransition: McapReferenceTransition | null;
  readonly updateWorldFrameId: (frameId: string) => void;
  readonly useRecommendedWorldFrame: () => void;
  readonly worldFrameId: string;
  readonly worldFrameSelectionSource: McapReferenceSelectionSource;
}

/**
 * Thin React adapter around the pure reference-frame reducer. Data-frame
 * identity is retained per selected topic across null playback gaps; graph
 * work is keyed only by topology and that bounded inventory, never by ticks.
 */
export function useMcap3dFrameSelection({
  annotationFrames,
  annotationTopics = [],
  calibrationFrames,
  calibrationTopics = [],
  frames,
  frameTransforms,
  gridFrames,
  gridTopics = [],
  carriedCameraTargetFrameId = null,
  onPreferredCameraTargetFrameIdChange,
  onPreferredWorldFrameIdChange,
  playbackTimeNs,
  pointCloudTopics = [],
  poseFrames = [],
  poseTopics = [],
  preferredCameraTargetFrameId = null,
  preferredWorldFrameId = null,
  primarySourceId = null,
  referenceAuthority = null,
  restore = null,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly annotationFrames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly annotationTopics?: readonly string[];
  readonly calibrationFrames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[];
  readonly calibrationTopics?: readonly string[];
  readonly frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly gridFrames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[];
  readonly gridTopics?: readonly string[];
  readonly carriedCameraTargetFrameId?: string | null;
  readonly onPreferredCameraTargetFrameIdChange?: (frameId: string) => void;
  readonly onPreferredWorldFrameIdChange?: (frameId: string | null) => void;
  readonly playbackTimeNs?: bigint;
  readonly pointCloudTopics?: readonly string[];
  readonly poseFrames?: readonly (McapTopicPlaybackFrame<PoseVisualization> | null)[];
  readonly poseTopics?: readonly string[];
  readonly preferredCameraTargetFrameId?: string | null;
  readonly preferredWorldFrameId?: string | null;
  readonly primarySourceId?: string | null;
  readonly referenceAuthority?: Mcap3dReferenceAuthority | null;
  readonly restore?: Mcap3dFrameSelectionRestore | null;
  readonly viewStateStore?: Mcap3dViewStateStore;
}) {
  const viewStateStore = useMcap3dViewStateStore(suppliedViewStateStore);
  const pendingUserWorldFrameIdRef = useRef(
    restore?.userWorldFrameId ?? preferredWorldFrameId,
  );
  const pendingUserCameraTargetFrameIdRef = useRef(
    restore?.userCameraTargetFrameId ?? preferredCameraTargetFrameId,
  );
  const lastPreferredWorldFrameIdRef = useRef(preferredWorldFrameId);
  const [userCameraTargetFrameId, setUserCameraTargetFrameId] = useState("");
  const lastKnownFrameIdsByTopicRef = useRef<
    ReadonlyMap<string, readonly string[]>
  >(new Map<string, readonly string[]>());
  const playbackTimeNsRef = useRef(playbackTimeNs);
  playbackTimeNsRef.current = playbackTimeNs;

  const frameInventory = useMemo(() => {
    const topicFrames: TopicFrameObservation[] = [
      ...coordinateTopicFrames(pointCloudTopics, frames, "point-cloud"),
      ...coordinateTopicFrames(gridTopics, gridFrames, "grid"),
      ...coordinateTopicFrames(
        calibrationTopics,
        calibrationFrames,
        "calibration",
      ),
      ...coordinateTopicFrames(poseTopics, poseFrames, "pose"),
      ...annotationTopicFrames(annotationTopics, annotationFrames),
    ];
    return nextLastKnownFrameInventory(
      lastKnownFrameIdsByTopicRef.current,
      topicFrames,
    );
  }, [
    annotationFrames,
    annotationTopics,
    calibrationFrames,
    calibrationTopics,
    frames,
    gridFrames,
    gridTopics,
    pointCloudTopics,
    poseFrames,
    poseTopics,
  ]);
  // This effect commits last-known frame identity only after React commits the
  // render, so an interrupted render cannot corrupt the inventory used by a
  // later playback gap.
  useEffect(() => {
    lastKnownFrameIdsByTopicRef.current = frameInventory.frameIdsByTopic;
  }, [frameInventory]);
  const inventoryKey = observationInventoryKey(frameInventory.observations);
  const observations = useMemo(
    () => frameInventory.observations,
    // Equal inventory keys describe equal, normalized observations. Keeping
    // the prior identity prevents playback ticks from retriggering graph work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventoryKey],
  );
  const dataBearingFrameIds = useMemo(
    () => uniqueSortedFrameIds(observations.flatMap((item) => item.frameIds)),
    [observations],
  );
  const topologyMemoKey =
    frameTransforms.topologyRevision ?? frameTransforms.frameIds.join("\0");
  const fallbackSummarizer =
    frameTransforms.topologyRevision === undefined
      ? frameTransforms.summarizeGraph
      : null;
  const graphSummary = useMemo(
    () => frameTransforms.summarizeGraph(new Set(dataBearingFrameIds)),
    // Production transform stores trigger only on `topologyRevision`; the
    // summarizer fallback keeps injected test states with no revision honest.
    // Dynamic samples on known edges cannot change component membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fallbackSummarizer, inventoryKey, topologyMemoKey],
  );
  const topologyRevisionKey =
    frameTransforms.topologyRevision?.toString() ??
    graphSummary.components
      .map((component) => component.join("\0"))
      .join("\u0001");
  const facts = useMemo(
    () => ({
      graphSummary,
      observations,
      primarySourceId,
      revisionKey: [
        topologyRevisionKey,
        inventoryKey,
        primarySourceId ?? "",
      ].join("\0"),
    }),
    [
      graphSummary,
      inventoryKey,
      observations,
      primarySourceId,
      topologyRevisionKey,
    ],
  );
  const [selection, dispatch] = useReducer(
    mcapReferenceSelectionReducer,
    facts,
    createMcapReferenceSelectionState,
  );

  // This effect feeds topology or inventory changes into the pure selection
  // reducer while sampling the current playhead only for a new promotion key.
  useEffect(() => {
    dispatch({
      facts,
      ...(playbackTimeNsRef.current === undefined
        ? {}
        : { timeNs: playbackTimeNsRef.current }),
      type: "factsChanged",
    });
  }, [facts]);

  const localFrameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameTransforms.frameIds,
        ...dataBearingFrameIds,
      ]),
    [dataBearingFrameIds, frameTransforms.frameIds],
  );
  const frameIds = useMemo(
    () =>
      referenceAuthority
        ? uniqueSortedFrameIds([
            ...localFrameIds,
            ...referenceAuthority.activeComponentFrameIds,
          ])
        : localFrameIds,
    [localFrameIds, referenceAuthority],
  );
  const localDecision = selection.decision;
  const activeComponentFrameIds =
    referenceAuthority?.activeComponentFrameIds ??
    localDecision.activeComponentFrameIds;
  const worldFrameId =
    referenceAuthority?.worldFrameId ?? localDecision.referenceFrameId;
  const referenceSelectionSource =
    referenceAuthority?.worldFrameSelectionSource ?? localDecision.source;
  const omittedFrameIds =
    referenceAuthority?.omittedFrameIds ?? localDecision.omittedFrameIds;
  const omittedSourceIds =
    referenceAuthority?.omittedSourceIds ?? localDecision.omittedSourceIds;
  const referenceTransition =
    referenceAuthority?.referenceTransition ?? selection.committedTransition;

  // This effect mirrors external preference changes into pending user intent,
  // including an explicit reset back to automatic recommendation.
  useEffect(() => {
    if (preferredWorldFrameId === lastPreferredWorldFrameIdRef.current) return;
    lastPreferredWorldFrameIdRef.current = preferredWorldFrameId;
    if (preferredWorldFrameId) {
      pendingUserWorldFrameIdRef.current = preferredWorldFrameId;
    } else {
      pendingUserWorldFrameIdRef.current = null;
      dispatch({ type: "useRecommendedReference" });
    }
  }, [preferredWorldFrameId]);

  // This effect adopts carried user intent once its frame appears in the
  // bounded inventory; ordinary content gaps keep the intent pending.
  useEffect(() => {
    const pendingWorld = pendingUserWorldFrameIdRef.current;
    if (mcap3dUserFrameRestoreApplies(pendingWorld, localFrameIds)) {
      pendingUserWorldFrameIdRef.current = null;
      dispatch({ frameId: pendingWorld, type: "userReferenceSelected" });
    }
    const pendingTarget = pendingUserCameraTargetFrameIdRef.current;
    if (mcap3dUserFrameRestoreApplies(pendingTarget, frameIds)) {
      pendingUserCameraTargetFrameIdRef.current = null;
      setUserCameraTargetFrameId(pendingTarget);
    }
  }, [frameIds, localFrameIds, preferredWorldFrameId]);

  const pendingPromotion = referenceAuthority
    ? null
    : selection.pendingPromotion;
  const transformBootstrapSettled =
    frameTransforms.status === "ready" || frameTransforms.status === "error";
  const placementTimeSettled =
    playbackTimeNs === undefined ||
    (frameTransforms.isPlacementTimeSettled?.(playbackTimeNs) ?? true);
  const navigationReferenceSettled =
    transformBootstrapSettled &&
    placementTimeSettled &&
    (referenceAuthority !== null ||
      (selection.facts.revisionKey === facts.revisionKey &&
        pendingPromotion === null));
  const indexedRangeKey = pendingPromotion
    ? frameTransforms
        .indexedDynamicRanges()
        .filter(
          (range) =>
            pendingPromotion.timeNs !== undefined &&
            range.startTimeNs <= pendingPromotion.timeNs &&
            pendingPromotion.timeNs <= range.endTimeNs,
        )
        .map((range) => `${range.startTimeNs}:${range.endTimeNs}`)
        .join("|")
    : "";
  const readinessGetterRef = useRef(frameTransforms.getPlacementReadiness);
  const prefetchPlacementRef = useRef(frameTransforms.prefetchPlacement);
  const resolveFrameTransformRef = useRef(frameTransforms.resolve);
  const readinessAttemptKeyRef = useRef<string | null>(null);
  readinessGetterRef.current = frameTransforms.getPlacementReadiness;
  prefetchPlacementRef.current = frameTransforms.prefetchPlacement;
  resolveFrameTransformRef.current = frameTransforms.resolve;
  // This effect checks a new promotion/range pair once. Tick-only renders do
  // not retry transform resolution or alter the reference decision.
  useEffect(() => {
    if (!pendingPromotion) return;
    const attemptKey = `${pendingPromotion.key}\0${indexedRangeKey}`;
    if (readinessAttemptKeyRef.current === attemptKey) return;
    readinessAttemptKeyRef.current = attemptKey;
    const readiness = readinessGetterRef.current({
      frameIds: pendingPromotion.frameIds,
      targetFrameId: pendingPromotion.candidateFrameId,
      ...(pendingPromotion.timeNs === undefined
        ? {}
        : { timeNs: pendingPromotion.timeNs }),
    });
    if (readiness.status === "ready") {
      // Readiness without a placement time only admits static transforms, for
      // which the resolver's required timestamp is immaterial.
      const resolutionTimeNs = pendingPromotion.timeNs ?? 0n;
      const resolution = resolveFrameTransformRef.current(
        pendingPromotion.sourceFrameId,
        pendingPromotion.candidateFrameId,
        resolutionTimeNs,
      );
      if (resolution.status === "resolved") {
        dispatch({
          key: pendingPromotion.key,
          transform: resolution.transform,
          type: "promotionResolved",
        });
      } else {
        dispatch({ key: pendingPromotion.key, type: "promotionRejected" });
      }
    } else if (readiness.status === "definitiveMissing") {
      dispatch({ key: pendingPromotion.key, type: "promotionRejected" });
    } else if (
      readiness.status === "needsFetch" &&
      pendingPromotion.timeNs !== undefined
    ) {
      prefetchPlacementRef.current(pendingPromotion.timeNs);
    }
  }, [indexedRangeKey, pendingPromotion]);

  const autoCameraTargetFrameId = chooseMcapCameraTarget(
    activeComponentFrameIds,
    worldFrameId,
  );
  const availableCarriedCameraTargetFrameId =
    carriedCameraTargetFrameId &&
    activeComponentFrameIds.includes(carriedCameraTargetFrameId)
      ? carriedCameraTargetFrameId
      : "";
  const cameraTargetFrameId =
    userCameraTargetFrameId && frameIds.includes(userCameraTargetFrameId)
      ? userCameraTargetFrameId
      : availableCarriedCameraTargetFrameId || autoCameraTargetFrameId;
  const cameraTargetSelectionSource: FrameSelectionSource =
    userCameraTargetFrameId && frameIds.includes(userCameraTargetFrameId)
      ? "user"
      : "auto";

  const updateLocalWorldFrameId = useCallback(
    (frameId: string) => {
      pendingUserWorldFrameIdRef.current = null;
      viewStateStore.recordUserWorldFrameId(frameId);
      onPreferredWorldFrameIdChange?.(frameId);
      dispatch({ frameId, type: "userReferenceSelected" });
    },
    [onPreferredWorldFrameIdChange, viewStateStore],
  );
  const updateWorldFrameId = useCallback(
    (frameId: string) => {
      if (referenceAuthority) {
        referenceAuthority.updateWorldFrameId(frameId);
      } else {
        updateLocalWorldFrameId(frameId);
      }
    },
    [referenceAuthority, updateLocalWorldFrameId],
  );
  const resetLocalWorldFrameRecommendation = useCallback(() => {
    pendingUserWorldFrameIdRef.current = null;
    viewStateStore.recordUserWorldFrameId(null);
    onPreferredWorldFrameIdChange?.(null);
    dispatch({ type: "useRecommendedReference" });
  }, [onPreferredWorldFrameIdChange, viewStateStore]);
  const useRecommendedWorldFrame = useCallback(() => {
    if (referenceAuthority) {
      referenceAuthority.useRecommendedWorldFrame();
    } else {
      resetLocalWorldFrameRecommendation();
    }
  }, [referenceAuthority, resetLocalWorldFrameRecommendation]);
  const updateCameraTargetFrameId = useCallback(
    (frameId: string) => {
      pendingUserCameraTargetFrameIdRef.current = null;
      viewStateStore.recordUserCameraTargetFrameId(frameId);
      onPreferredCameraTargetFrameIdChange?.(frameId);
      setUserCameraTargetFrameId(frameId);
    },
    [onPreferredCameraTargetFrameIdChange, viewStateStore],
  );

  return {
    activeComponentFrameIds,
    cameraTargetFrameId,
    cameraTargetSelectionSource,
    frameIds,
    localActiveComponentFrameIds: localDecision.activeComponentFrameIds,
    localFrameIds,
    localOmittedFrameIds: localDecision.omittedFrameIds,
    localOmittedSourceIds: localDecision.omittedSourceIds,
    localReferenceTransition: selection.committedTransition,
    localReferenceSelectionSource: localDecision.source,
    localUseRecommendedWorldFrame: resetLocalWorldFrameRecommendation,
    localUpdateWorldFrameId: updateLocalWorldFrameId,
    localWorldFrameId: localDecision.referenceFrameId,
    omittedFrameIds,
    omittedSourceIds,
    navigationReferenceSettled,
    pendingPromotion,
    referenceTransition,
    referenceSelectionSource,
    updateCameraTargetFrameId,
    updateWorldFrameId,
    useRecommendedWorldFrame,
    worldFrameId,
    worldFrameSelectionSource:
      referenceSelectionSource === "user" ||
      (!referenceAuthority && selection.userReferenceFrameId !== null)
        ? ("user" as const)
        : ("auto" as const),
  };
}

/** Returns whether a carried user frame is available in the current inventory. */
export function mcap3dUserFrameRestoreApplies(
  frameId: string | null,
  frameIds: readonly string[],
): frameId is string {
  return frameId !== null && frameId !== "" && frameIds.includes(frameId);
}

interface TopicFrameObservation {
  readonly frameIds: readonly string[];
  readonly sourceId: string;
}

function coordinateTopicFrames<
  Frame extends { readonly coordinateFrameId?: string },
>(
  topics: readonly string[],
  frames: readonly (McapTopicPlaybackFrame<Frame> | null)[],
  fallbackPrefix: string,
): readonly TopicFrameObservation[] {
  return frames.map((playbackFrame, index) => ({
    frameIds: playbackFrame?.frame.coordinateFrameId
      ? [playbackFrame.frame.coordinateFrameId]
      : [],
    sourceId: topics[index] ?? `${fallbackPrefix}:${index}`,
  }));
}

function annotationTopicFrames(
  topics: readonly string[],
  frames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[],
): readonly TopicFrameObservation[] {
  return frames.map((playbackFrame, index) => ({
    frameIds:
      playbackFrame?.frame.entities
        .map((entity) => entity.frameId)
        .filter((frameId): frameId is string => typeof frameId === "string") ??
      [],
    sourceId: topics[index] ?? `annotation:${index}`,
  }));
}

function nextLastKnownFrameInventory(
  current: ReadonlyMap<string, readonly string[]>,
  topicFrames: readonly TopicFrameObservation[],
): {
  readonly frameIdsByTopic: ReadonlyMap<string, readonly string[]>;
  readonly observations: readonly McapFrameObservation[];
} {
  const next = new Map(current);
  const selectedTopics = new Set(topicFrames.map((item) => item.sourceId));
  for (const topic of next.keys()) {
    if (!selectedTopics.has(topic)) next.delete(topic);
  }
  const observedFrameIdsByTopic = new Map<string, string[]>();
  for (const item of topicFrames) {
    const frameIds = observedFrameIdsByTopic.get(item.sourceId) ?? [];
    frameIds.push(...item.frameIds);
    observedFrameIdsByTopic.set(item.sourceId, frameIds);
  }
  for (const [topic, observedFrameIds] of observedFrameIdsByTopic) {
    const frameIds = uniqueSortedFrameIds(observedFrameIds);
    if (frameIds.length > 0) next.set(topic, frameIds);
  }
  return {
    frameIdsByTopic: next,
    observations: [...next.entries()]
      .map(([sourceId, frameIds]) => ({ frameIds, sourceId }))
      .sort((left, right) => compareFrameIds(left.sourceId, right.sourceId)),
  };
}

function observationInventoryKey(
  observations: readonly McapFrameObservation[],
): string {
  return observations
    .map(
      (observation) =>
        `${observation.sourceId}:${observation.frameIds.join(",")}`,
    )
    .join("|");
}

function uniqueSortedFrameIds(frameIds: readonly string[]): readonly string[] {
  return [...new Set(frameIds.map((id) => id.trim()).filter(Boolean))].sort(
    compareFrameIds,
  );
}

function compareFrameIds(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
