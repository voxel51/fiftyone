import { Quaternion, Vector3 } from "three";
import type {
  PointCloudVisualization,
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type {
  PointCloudFrameTransform,
  PointCloudPanelLayer,
  SceneAnnotationPanelLayer,
} from "../../../visualization/panels/point-cloud";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

/**
 * Resolution of one source frame into the world frame for placement.
 * `pending` means "not resolvable yet" (frames/time/window still loading) and
 * the layer can still render in its source frame; `missing` means the data is
 * loaded but no path exists and the cloud should be dropped with a warning.
 */
type FrameTransformResolution =
  | {
      readonly maxInterpolationGapNs?: bigint;
      readonly status: "resolved";
      readonly transform: PointCloudFrameTransform;
    }
  | { readonly status: "pending" }
  | { readonly status: "missing" };

export interface Mcap3dTransformGapWarning {
  readonly frameId: string;
  readonly gapNs: bigint;
}

export interface Mcap3dLayerBuildResult {
  readonly clampedFrameIds: readonly string[];
  readonly largeInterpolationGaps: readonly Mcap3dTransformGapWarning[];
  readonly pendingAnnotationFrameIds: readonly string[];
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
  readonly provisionalFrameIds: readonly string[];
  readonly sceneAnnotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly transformedLayerCount: number;
  readonly unresolvedFrameIds: readonly string[];
}

/**
 * Builds the point-cloud layers for the 3D tile, transforming each cloud into
 * the chosen world frame. Clouds that cannot be placed *yet* (transforms still
 * loading) render in their own frame when callers choose to draw through
 * pending state; clouds with no resolvable path to the world frame are dropped
 * and reported through `unresolvedFrameIds`.
 */
export function build3dLayers({
  annotationFrames = [],
  frameTransforms,
  frames,
  largeInterpolationGapWarningNs = 0n,
  provisionalTopicId,
  selectedAnnotationTopics = [],
  selectedTopics,
  worldFrameId,
}: {
  readonly annotationFrames?: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[];
  readonly largeInterpolationGapWarningNs?: bigint;
  readonly provisionalTopicId?: string | null;
  readonly selectedAnnotationTopics?: readonly string[];
  readonly selectedTopics: readonly string[];
  readonly worldFrameId: string;
}): Mcap3dLayerBuildResult {
  const pointCloudLayers: PointCloudPanelLayer[] = [];
  const sceneAnnotationLayers: SceneAnnotationPanelLayer[] = [];
  const clampedFrameIds = new Set<string>();
  const largeInterpolationGapsByFrameId = new Map<string, bigint>();
  const pendingAnnotationFrameIds = new Set<string>();
  const pendingTopicId = provisionalTopicId ?? selectedTopics[0] ?? null;
  const provisionalFrameIds = new Set<string>();
  let transformedLayerCount = 0;
  const unresolvedFrameIds = new Set<string>();
  const transformCache = new Map<string, FrameTransformResolution>();
  const resolveCachedFrameTransform = (
    sourceFrameId: string,
    requestedTimeNs: bigint,
  ) => {
    const cacheKey = `${sourceFrameId}:${requestedTimeNs.toString()}`;
    const cached = transformCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolution = resolveFrameTransform({
      frameTransforms,
      sourceFrameId,
      timeNs: requestedTimeNs,
      clampedFrameIds,
      largeInterpolationGapWarningNs,
      largeInterpolationGapsByFrameId,
      unresolvedFrameIds,
      worldFrameId,
    });
    transformCache.set(cacheKey, resolution);

    return resolution;
  };

  selectedTopics.forEach((topic, index) => {
    const playbackFrame = frames[index];
    if (!playbackFrame) {
      return;
    }

    const frame = playbackFrame.frame;
    if (!frame.coordinateFrameId) {
      // Frameless cloud: nothing to transform, render at the scene origin.
      pointCloudLayers.push({ frame, id: topic });
      transformedLayerCount += 1;
      return;
    }

    const resolution = resolveCachedFrameTransform(
      frame.coordinateFrameId,
      playbackFrame.contentTimeNs,
    );
    // Drop only genuinely unplaceable clouds (`missing`): the warning explains
    // why. Pending transforms are truthful provisional placement, so render
    // only the deterministic provisional source instead of raw-overlapping all
    // sensors in their own frames.
    if (resolution.status === "missing") {
      return;
    }
    if (resolution.status === "pending" && topic !== pendingTopicId) {
      return;
    }
    if (resolution.status === "pending") {
      provisionalFrameIds.add(frame.coordinateFrameId);
    } else {
      transformedLayerCount += 1;
    }

    pointCloudLayers.push({
      frame,
      frameTransform:
        resolution.status === "resolved" ? resolution.transform : undefined,
      id: topic,
    });
  });

  selectedAnnotationTopics.forEach((topic, index) => {
    const playbackFrame = annotationFrames[index];
    if (!playbackFrame) {
      return;
    }

    playbackFrame.frame.entities.forEach((entity, entityIndex) => {
      if (entity.cubeCount === 0) {
        return;
      }

      const layer = buildSceneAnnotationLayer({
        entity,
        entityIndex,
        playbackFrame,
        resolveCachedFrameTransform,
        pendingAnnotationFrameIds,
        topic,
      });
      if (!layer) {
        return;
      }

      transformedLayerCount += 1;
      sceneAnnotationLayers.push(layer);
    });
  });

  return {
    clampedFrameIds: [...clampedFrameIds].sort(),
    largeInterpolationGaps: [...largeInterpolationGapsByFrameId.entries()]
      .map(([frameId, gapNs]) => ({ frameId, gapNs }))
      .sort((left, right) => left.frameId.localeCompare(right.frameId)),
    pendingAnnotationFrameIds: [...pendingAnnotationFrameIds].sort(),
    pointCloudLayers,
    provisionalFrameIds: [...provisionalFrameIds].sort(),
    sceneAnnotationLayers,
    transformedLayerCount,
    unresolvedFrameIds: [...unresolvedFrameIds].sort(),
  };
}

function buildSceneAnnotationLayer({
  entity,
  entityIndex,
  pendingAnnotationFrameIds,
  playbackFrame,
  resolveCachedFrameTransform,
  topic,
}: {
  readonly entity: SceneEntityVisualization;
  readonly entityIndex: number;
  readonly pendingAnnotationFrameIds: Set<string>;
  readonly playbackFrame: McapTopicPlaybackFrame<SceneUpdateVisualization>;
  readonly resolveCachedFrameTransform: (
    sourceFrameId: string,
    requestedTimeNs: bigint,
  ) => FrameTransformResolution;
  readonly topic: string;
}): SceneAnnotationPanelLayer | null {
  const requestedTimeNs = entity.frameLocked
    ? playbackFrame.requestedTimeNs
    : (entity.timestampNs ?? playbackFrame.contentTimeNs);
  const sceneFrame: SceneUpdateVisualization = {
    ...playbackFrame.frame,
    deletions: [],
    entities: [entity],
  };
  const id = `${topic}:${entity.id || entityIndex}`;

  if (!entity.frameId) {
    return { frame: sceneFrame, id };
  }

  const resolution = resolveCachedFrameTransform(
    entity.frameId,
    requestedTimeNs,
  );
  if (resolution.status === "missing") {
    return null;
  }
  if (resolution.status === "pending") {
    pendingAnnotationFrameIds.add(entity.frameId);
    return null;
  }

  return {
    frame: sceneFrame,
    frameTransform: resolution.transform,
    id,
  };
}

function resolveFrameTransform({
  frameTransforms,
  largeInterpolationGapWarningNs,
  largeInterpolationGapsByFrameId,
  sourceFrameId,
  timeNs,
  clampedFrameIds,
  unresolvedFrameIds,
  worldFrameId,
}: {
  readonly frameTransforms: McapFrameTransformsState;
  readonly largeInterpolationGapWarningNs: bigint;
  readonly largeInterpolationGapsByFrameId: Map<string, bigint>;
  readonly sourceFrameId: string;
  readonly timeNs: bigint | undefined;
  readonly clampedFrameIds: Set<string>;
  readonly unresolvedFrameIds: Set<string>;
  readonly worldFrameId: string;
}): FrameTransformResolution {
  // No world frame chosen yet (frames still loading). Treat as loading so the
  // cloud renders in its own frame instead of vanishing.
  if (!worldFrameId) {
    return { status: "pending" };
  }

  if (sourceFrameId === worldFrameId) {
    return {
      status: "resolved",
      transform: {
        rotation: new Quaternion(),
        sourceFrameId,
        targetFrameId: worldFrameId,
        translation: new Vector3(),
      },
    };
  }

  // Playback time not known yet: loading, not missing.
  if (timeNs === undefined) {
    return { status: "pending" };
  }

  const resolution = frameTransforms.resolve(
    sourceFrameId,
    worldFrameId,
    timeNs,
  );
  if (resolution.status === "resolved") {
    if (resolution.resolutionKind === "clamped") {
      clampedFrameIds.add(sourceFrameId);
    }
    if (
      largeInterpolationGapWarningNs > 0n &&
      resolution.maxInterpolationGapNs !== undefined &&
      resolution.maxInterpolationGapNs > largeInterpolationGapWarningNs
    ) {
      setMaxInterpolationGap(
        largeInterpolationGapsByFrameId,
        sourceFrameId,
        resolution.maxInterpolationGapNs,
      );
    }
    return {
      ...(resolution.maxInterpolationGapNs !== undefined
        ? { maxInterpolationGapNs: resolution.maxInterpolationGapNs }
        : {}),
      status: "resolved",
      transform: resolution.transform,
    };
  }
  if (resolution.status === "pending") {
    return { status: "pending" };
  }

  // The transform window is loaded but no path connects this frame to the world
  // frame. Surface it; the caller drops the cloud rather than draw it wrong.
  unresolvedFrameIds.add(sourceFrameId);
  return { status: "missing" };
}

function setMaxInterpolationGap(
  gapsByFrameId: Map<string, bigint>,
  frameId: string,
  gapNs: bigint,
) {
  const current = gapsByFrameId.get(frameId);
  if (current === undefined || gapNs > current) {
    gapsByFrameId.set(frameId, gapNs);
  }
}
