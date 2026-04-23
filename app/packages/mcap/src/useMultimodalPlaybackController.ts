import React from "react";
import type { Buffers } from "@fiftyone/utilities";
import type { BufferReadiness } from "@fiftyone/playback/experimental/types";
import type {
  Image2dFrame,
  Image2dOverlayPrimitive,
  Scene3dFrame,
} from "./archetypes";
import { fetchMultimodalBootstrapWindow } from "./api";
import {
  type DecodedFoxgloveCameraCalibration,
  decodeFoxgloveCameraCalibrationPayload,
} from "./foxglove-camera-calibration-decoder";
import { decodeFoxgloveImageAnnotationsPayload } from "./foxglove-image-annotations-decoder";
import {
  MultimodalImageBufferCache,
  type MultimodalDecodedImageFrame,
} from "./image-buffer-cache";
import { projectSceneFrameToImageOverlays } from "./image-projection";
import {
  MultimodalRenderable3dBufferCache,
  type MultimodalDecodedScene3dFrame,
} from "./renderable3d-buffer-cache";
import {
  type DecodedNavSatFixSample,
  type DecodedPoseSample,
  type DecodedTransform,
} from "./ros-decoder";
import {
  isImageRenderableStream,
  isImageSupportStream,
  isScene3dRenderableStream,
} from "./panel-binding-registry";
import { MultimodalRawMessageWindowCache } from "./raw-message-window-cache";
import {
  MULTIMODAL_BUFFER_WINDOW_SIZE_NS,
  findNearestTimestampAtOrAfter,
  findNearestTimestampAtOrBefore,
  inferMultimodalTimelineFrameRate,
} from "./playback-utils";
import {
  applyTransformToScene3dFrame,
  createFollowPoseFromNavSat,
  createFollowPoseFromPose,
  getStreamColor,
  mergeScene3dFrames,
  transformPoseSample,
  type TransformSample,
} from "./transform-runtime";
import {
  MultimodalTransformGraphCache,
  type TransformGraphSnapshot,
  type TransformSampleSet,
} from "./transform-graph-cache";
import type {
  MultimodalCatalog,
  MultimodalPanelLayoutState,
  MultimodalRawMessage,
  MultimodalRawBufferResponse,
  MultimodalTimelineIndexResponse,
  MultimodalTimelineSample,
  MultimodalWorkspaceState,
} from "./types";
import {
  type MultimodalExperimentalTimelineState,
  useMultimodalExperimentalTimeline,
} from "./useMultimodalExperimentalTimeline";
import { useMultimodalTimelineIndex } from "./useMultimodalTimelineIndex";
import {
  BUILTIN_SCHEMA_CODEC_REGISTRY,
  type DecodedLocationSample,
} from "./schema-codec-registry";

type MultimodalPlaybackPanelState = {
  status: "idle" | "loading" | "ready" | "error" | "empty";
  archetype: "image" | "3d";
  statusDetail: string | null;
  imageFrame: Image2dFrame | null;
  sceneFrame: Scene3dFrame | null;
  colorMode: "intensity" | "rgb";
  followPose: {
    position: [number, number, number];
    orientation?: [number, number, number, number] | null;
  } | null;
  messageIds: string[];
  logTimeNs: number | null;
  publishTimeNs: number | null;
  transformRevision: number | null;
  warnings: string[];
  error: Error | null;
};

type UseMultimodalPlaybackControllerResult = {
  timelineName: string | null;
  timeline: MultimodalTimelineIndexResponse | null;
  isLoading: boolean;
  isBootstrapping: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isTimelineInitialized: boolean;
  hasPlayback: boolean;
  canControlPlayback: boolean;
  timelineState: MultimodalExperimentalTimelineState;
  panelStates: Record<string, MultimodalPlaybackPanelState>;
};

const MULTIMODAL_PREFETCH_WINDOW_PADDING_BEHIND_NS =
  MULTIMODAL_BUFFER_WINDOW_SIZE_NS;
const MULTIMODAL_PREFETCH_WINDOW_PADDING_AHEAD_NS =
  MULTIMODAL_BUFFER_WINDOW_SIZE_NS;
const MULTIMODAL_IMAGE_DECODE_LOOKAHEAD_COUNT = 2;
const MULTIMODAL_POINTCLOUD_DECODE_LOOKAHEAD_COUNT = 1;
const MULTIMODAL_BOOTSTRAP_TRANSFORM_WINDOW_NS = 1_000_000_000;
const PREFERRED_EGO_FOLLOW_FRAME_IDS = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
] as const;

type MultimodalBootstrapPlan = {
  anchorTimeNs: number;
  playbackPanelId: string | null;
  criticalRenderStreamIds: string[];
  criticalSupportStreamIds: string[];
  nonCriticalRenderStreamIds: string[];
  nonCriticalSupportStreamIds: string[];
  transformStreamIds: string[];
  locationStreamIds: string[];
};

function createInitialPanelState(
  panel: MultimodalPanelLayoutState
): MultimodalPlaybackPanelState {
  return {
    status: "idle",
    archetype: panel.archetype,
    statusDetail: "Waiting for boot data",
    imageFrame: null,
    sceneFrame: null,
    colorMode: "rgb",
    followPose: null,
    messageIds: [],
    logTimeNs: null,
    publishTimeNs: null,
    transformRevision: null,
    warnings: [],
    error: null,
  };
}

function createInitialPanelStates(panels: MultimodalPanelLayoutState[]) {
  return Object.fromEntries(
    panels.map((panel) => [panel.panelId, createInitialPanelState(panel)])
  ) as Record<string, MultimodalPlaybackPanelState>;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function hasRenderableContent(
  panelState: MultimodalPlaybackPanelState | undefined
) {
  return Boolean(panelState?.imageFrame || panelState?.sceneFrame);
}

function isPanelHydrated(panelState: MultimodalPlaybackPanelState | undefined) {
  return Boolean(
    panelState &&
      (panelState.status === "ready" ||
        panelState.status === "empty" ||
        panelState.status === "error")
  );
}

function arraysEqual<T>(left: T[], right: T[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function prefixImageOverlays(
  overlays: Image2dOverlayPrimitive[],
  prefix: string
) {
  return overlays.map((overlay) => ({
    ...overlay,
    id: `${prefix}:${overlay.id}`,
  }));
}

function isImageStream(
  catalogStream: Pick<MultimodalCatalog["streams"][number], "compatiblePanels">
) {
  return isImageRenderableStream(catalogStream);
}

function is3dStream(
  catalogStream: Pick<MultimodalCatalog["streams"][number], "compatiblePanels">
) {
  return isScene3dRenderableStream(catalogStream);
}

function getHeroPanel(panels: MultimodalPanelLayoutState[]) {
  return (
    panels.find((panel) => panel.archetype === "3d") ??
    panels.find((panel) => panel.archetype === "image") ??
    null
  );
}

function getActivePanel(
  panels: MultimodalPanelLayoutState[],
  panelId: string | null
) {
  return panels.find((panel) => panel.panelId === panelId) ?? null;
}

function getPlaybackPanel(
  panels: MultimodalPanelLayoutState[],
  activePanelId: string | null
) {
  return getActivePanel(panels, activePanelId) ?? getHeroPanel(panels);
}

function getPanelAggregationFrameId(panel: MultimodalPanelLayoutState) {
  return panel.frameConfig.fixedFrameId ?? panel.frameConfig.displayFrameId;
}

function getPanelDisplayFrameId(panel: MultimodalPanelLayoutState) {
  return panel.frameConfig.displayFrameId ?? panel.frameConfig.fixedFrameId;
}

function getPanelFollowFrameId(
  catalog: MultimodalCatalog,
  panel: MultimodalPanelLayoutState
) {
  const targetFrameId = getPanelDisplayFrameId(panel);
  const normalizedFrameIds = new Map(
    catalog.frames.map((frame) => [frame.frameId.toLowerCase(), frame.frameId])
  );

  for (const preferredFrameId of PREFERRED_EGO_FOLLOW_FRAME_IDS) {
    const candidateFrameId = normalizedFrameIds.get(preferredFrameId);
    if (candidateFrameId && candidateFrameId !== targetFrameId) {
      return candidateFrameId;
    }
  }

  return null;
}

function applyFollowMode(
  pose: MultimodalPlaybackPanelState["followPose"],
  followMode: MultimodalPanelLayoutState["frameConfig"]["followMode"]
) {
  if (!pose || followMode !== "position") {
    return pose;
  }

  return {
    position: pose.position,
    orientation: null,
  };
}

function isImage3dOverlayProjectionEnabled(panel: MultimodalPanelLayoutState) {
  return panel.archetype === "image"
    ? panel.imageConfig?.project3dOverlays ?? false
    : false;
}

function shouldTrackImageSupportStream(
  panel: MultimodalPanelLayoutState,
  stream: Pick<
    MultimodalCatalog["streams"][number],
    "compatiblePanels" | "kind" | "schemaName"
  > | null
) {
  if (panel.archetype !== "image" || !stream || !isImageSupportStream(stream)) {
    return false;
  }

  if (stream.schemaName === "foxglove.CameraCalibration") {
    return isImage3dOverlayProjectionEnabled(panel);
  }

  if (is3dStream(stream)) {
    return isImage3dOverlayProjectionEnabled(panel);
  }

  return true;
}

function getTrackedImageSupportStreamIds(
  catalog: MultimodalCatalog,
  panel: MultimodalPanelLayoutState
) {
  if (panel.archetype !== "image") {
    return [];
  }

  const streamLookup = new Map(
    catalog.streams.map((stream) => [stream.streamId, stream])
  );

  return panel.visibleStreamIds.filter((streamId) =>
    shouldTrackImageSupportStream(panel, streamLookup.get(streamId) ?? null)
  );
}

function getBootstrapPlan(
  catalog: MultimodalCatalog | null,
  workspaceState: MultimodalWorkspaceState | null
): MultimodalBootstrapPlan | null {
  if (!catalog || !workspaceState) {
    return null;
  }

  const playbackPanel = getPlaybackPanel(
    workspaceState.panels,
    workspaceState.activePanelId
  );
  if (!playbackPanel) {
    return {
      anchorTimeNs: 0,
      playbackPanelId: null,
      criticalRenderStreamIds: [],
      criticalSupportStreamIds: [],
      nonCriticalRenderStreamIds: [],
      nonCriticalSupportStreamIds: [],
      transformStreamIds: [],
      locationStreamIds: [],
    };
  }

  const imageRenderStreamIds = workspaceState.panels
    .filter((panel) => panel.archetype === "image")
    .map((panel) => panel.renderStreamId)
    .filter((value): value is string => Boolean(value));
  const imageSupportStreamIds = workspaceState.panels
    .filter((panel) => panel.archetype === "image")
    .flatMap((panel) => getTrackedImageSupportStreamIds(catalog, panel));
  const criticalRenderStreamIds =
    playbackPanel.archetype === "3d"
      ? playbackPanel.visibleStreamIds.slice(0, 1)
      : playbackPanel.renderStreamId
      ? [playbackPanel.renderStreamId]
      : [];
  const criticalSupportStreamIds: string[] = [];
  const nonCriticalRenderStreamIds = Array.from(
    new Set(
      [
        ...imageRenderStreamIds,
        ...workspaceState.panels
          .filter((panel) => panel.archetype === "3d")
          .flatMap((panel) => panel.visibleStreamIds),
      ].filter((streamId) => !criticalRenderStreamIds.includes(streamId))
    )
  );
  const nonCriticalSupportStreamIds = Array.from(
    new Set(
      imageSupportStreamIds.filter(
        (streamId) => !criticalSupportStreamIds.includes(streamId)
      )
    )
  );

  const needsTransforms =
    playbackPanel.archetype === "3d"
      ? Boolean(getPanelAggregationFrameId(playbackPanel)) ||
        Boolean(getPanelDisplayFrameId(playbackPanel)) ||
        playbackPanel.frameConfig.followMode !== "off" ||
        playbackPanel.visibleStreamIds.some((streamId) => {
          const stream = catalog.streams.find(
            (candidate) => candidate.streamId === streamId
          );
          return Boolean(stream?.frameId);
        })
      : false;
  const locationStreamIds = playbackPanel.frameConfig.locationStreamId
    ? [playbackPanel.frameConfig.locationStreamId]
    : [];

  return {
    anchorTimeNs: 0,
    playbackPanelId: playbackPanel.panelId,
    criticalRenderStreamIds,
    criticalSupportStreamIds,
    nonCriticalRenderStreamIds,
    nonCriticalSupportStreamIds,
    transformStreamIds: needsTransforms
      ? catalog.streams
          .filter((stream) => stream.kind === "transform")
          .map((stream) => stream.streamId)
      : [],
    locationStreamIds,
  };
}

function followPoseEqual(
  left: MultimodalPlaybackPanelState["followPose"],
  right: MultimodalPlaybackPanelState["followPose"]
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  return (
    arraysEqual(left.position, right.position) &&
    arraysEqual(left.orientation ?? [], right.orientation ?? [])
  );
}

function panelStateEqual(
  left: MultimodalPlaybackPanelState,
  right: MultimodalPlaybackPanelState
) {
  return (
    left.status === right.status &&
    left.archetype === right.archetype &&
    left.statusDetail === right.statusDetail &&
    left.imageFrame === right.imageFrame &&
    left.sceneFrame === right.sceneFrame &&
    left.colorMode === right.colorMode &&
    followPoseEqual(left.followPose, right.followPose) &&
    arraysEqual(left.messageIds, right.messageIds) &&
    left.logTimeNs === right.logTimeNs &&
    left.publishTimeNs === right.publishTimeNs &&
    left.transformRevision === right.transformRevision &&
    arraysEqual(left.warnings, right.warnings) &&
    (left.error?.message ?? null) === (right.error?.message ?? null)
  );
}

function expandPrefetchRange(
  sceneRange: { startNs: number; endNs: number },
  requestedRange: { startNs: number; endNs: number }
) {
  return {
    startNs: Math.max(
      sceneRange.startNs,
      requestedRange.startNs - MULTIMODAL_PREFETCH_WINDOW_PADDING_BEHIND_NS
    ),
    endNs: Math.min(
      sceneRange.endNs,
      requestedRange.endNs + MULTIMODAL_PREFETCH_WINDOW_PADDING_AHEAD_NS
    ),
  };
}

function areRangesContinuous(
  left: readonly [number, number],
  right: readonly [number, number]
) {
  return right[0] <= left[1];
}

function getMergedBufferedRanges(
  ranges: Array<readonly [number, number]>
): Buffers {
  if (!ranges.length) {
    return [];
  }

  const merged: Array<[number, number]> = [];
  const sortedRanges = [...ranges].sort((left, right) => left[0] - right[0]);

  sortedRanges.forEach((range) => {
    const previousRange = merged[merged.length - 1];
    if (!previousRange) {
      merged.push([range[0], range[1]]);
      return;
    }

    if (areRangesContinuous(previousRange, range)) {
      previousRange[1] = Math.max(previousRange[1], range[1]);
      return;
    }

    merged.push([range[0], range[1]]);
  });

  return merged;
}

function findPlaybackSampleForNearestSync(
  samples: MultimodalTimelineSample[],
  targetTimestampNs: number
) {
  if (!samples.length) {
    return null;
  }

  let left = 0;
  let right = samples.length - 1;
  let matchIndex = -1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const sample = samples[middle];

    if (sample.timestampNs <= targetTimestampNs) {
      matchIndex = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  if (matchIndex >= 0) {
    return samples[matchIndex];
  }

  return samples[0] ?? null;
}

function markPerformance(name: string) {
  if (typeof performance === "undefined" || !performance.mark) {
    return;
  }

  performance.mark(name);
}

function measurePerformance(name: string, startMark: string, endMark: string) {
  if (typeof performance === "undefined" || !performance.measure) {
    return;
  }

  try {
    performance.measure(name, startMark, endMark);
  } catch {
    // no-op when marks are missing in tests or partial boot paths
  }
}

function decodeLocationPayload(
  schemaName: string,
  payload: Uint8Array
): DecodedLocationSample | null {
  return BUILTIN_SCHEMA_CODEC_REGISTRY.decodeLocationPayload(
    schemaName,
    payload
  );
}

const EMPTY_TRANSFORM_GRAPH_SNAPSHOT: TransformGraphSnapshot = {
  graph: new Map(),
  revision: 0,
  resolveMatrix: () => null,
};

export function useMultimodalPlaybackController(
  catalog: MultimodalCatalog | null,
  workspaceState: MultimodalWorkspaceState | null
): UseMultimodalPlaybackControllerResult {
  const panels = workspaceState?.panels ?? [];
  const renderStreamIds = React.useMemo(() => {
    return Array.from(
      new Set(
        panels.flatMap((panel) =>
          panel.archetype === "image"
            ? panel.renderStreamId
              ? [panel.renderStreamId]
              : []
            : panel.visibleStreamIds
        )
      )
    );
  }, [panels]);
  const supportStreamIds = React.useMemo(() => {
    if (!catalog) {
      return [];
    }

    return Array.from(
      new Set(
        panels.flatMap((panel) =>
          panel.archetype === "image"
            ? getTrackedImageSupportStreamIds(catalog, panel)
            : []
        )
      )
    );
  }, [catalog, panels]);
  const transformStreamIds = React.useMemo(() => {
    return (catalog?.streams ?? [])
      .filter((stream) => stream.kind === "transform")
      .map((stream) => stream.streamId);
  }, [catalog?.streams]);
  const locationStreamIds = React.useMemo(() => {
    return Array.from(
      new Set(
        panels
          .map((panel) => panel.frameConfig.locationStreamId)
          .filter((value): value is string => Boolean(value))
      )
    );
  }, [panels]);
  const trackedStreamIds = React.useMemo(() => {
    return Array.from(
      new Set([
        ...renderStreamIds,
        ...supportStreamIds,
        ...transformStreamIds,
        ...locationStreamIds,
      ])
    );
  }, [
    locationStreamIds,
    renderStreamIds,
    supportStreamIds,
    transformStreamIds,
  ]);
  const timelineName = catalog ? `multimodal:${catalog.sceneId}` : null;
  const bootstrapPlan = React.useMemo(
    () => getBootstrapPlan(catalog, workspaceState),
    [catalog, workspaceState]
  );
  const timelineRenderStreamIds = bootstrapPlan?.criticalRenderStreamIds ?? [];
  const timelineRenderStreamIdsKey = React.useMemo(() => {
    return timelineRenderStreamIds.join("\n");
  }, [timelineRenderStreamIds]);
  const criticalTrackedStreamIds = React.useMemo(() => {
    return dedupeStrings([
      ...timelineRenderStreamIds,
      ...(bootstrapPlan?.transformStreamIds ?? []),
      ...(bootstrapPlan?.locationStreamIds ?? []),
    ]);
  }, [
    bootstrapPlan?.locationStreamIds,
    bootstrapPlan?.transformStreamIds,
    timelineRenderStreamIds,
  ]);
  const backgroundTrackedStreamIds = React.useMemo(() => {
    return trackedStreamIds.filter(
      (streamId) => !criticalTrackedStreamIds.includes(streamId)
    );
  }, [criticalTrackedStreamIds, trackedStreamIds]);
  const timelineParams = React.useMemo(() => {
    if (!catalog) {
      return null;
    }

    return {
      datasetId: catalog.datasetId,
      sampleId: catalog.sampleId,
      request: {
        mediaField: catalog.mediaField,
        streamIds: timelineRenderStreamIds,
        timestampSource: workspaceState?.sync.timestampSource,
        fallback: workspaceState?.sync.fallback,
      },
    };
  }, [
    catalog,
    timelineRenderStreamIdsKey,
    workspaceState?.sync.fallback,
    workspaceState?.sync.timestampSource,
  ]);
  const { timeline, isLoading, error, refetch } =
    useMultimodalTimelineIndex(timelineParams);
  const hasFullTimeline = Boolean(timeline?.timestampsNs.length);
  const timelineDurationNs = React.useMemo(() => {
    const lastTimelineTimestamp =
      timeline?.timestampsNs[timeline.timestampsNs.length - 1] ?? 0;
    return Math.max(catalog?.timeRange.endNs ?? 0, lastTimelineTimestamp);
  }, [catalog?.timeRange.endNs, timeline?.timestampsNs]);
  const targetFrameRate = React.useMemo(
    () =>
      hasFullTimeline
        ? inferMultimodalTimelineFrameRate(timeline?.timestampsNs ?? [])
        : 30,
    [hasFullTimeline, timeline?.timestampsNs]
  );
  const bootstrapPlanKey = React.useMemo(() => {
    if (!bootstrapPlan) {
      return "";
    }

    return [
      bootstrapPlan.playbackPanelId ?? "",
      bootstrapPlan.anchorTimeNs,
      bootstrapPlan.criticalRenderStreamIds.join("\n"),
      bootstrapPlan.criticalSupportStreamIds.join("\n"),
      bootstrapPlan.nonCriticalRenderStreamIds.join("\n"),
      bootstrapPlan.nonCriticalSupportStreamIds.join("\n"),
      bootstrapPlan.transformStreamIds.join("\n"),
      bootstrapPlan.locationStreamIds.join("\n"),
    ].join("::");
  }, [bootstrapPlan]);
  const [panelStates, setPanelStates] = React.useState<
    Record<string, MultimodalPlaybackPanelState>
  >({});
  const [isBootstrapping, setIsBootstrapping] = React.useState(false);
  const mountedRef = React.useRef(true);
  const panelStatesRef = React.useRef<
    Record<string, MultimodalPlaybackPanelState>
  >({});
  const catalogRef = React.useRef<MultimodalCatalog | null>(catalog);
  const workspaceStateRef = React.useRef<MultimodalWorkspaceState | null>(
    workspaceState
  );
  const imageCachesRef = React.useRef(
    new Map<string, MultimodalImageBufferCache>()
  );
  const renderable3dCachesRef = React.useRef(
    new Map<string, MultimodalRenderable3dBufferCache>()
  );
  const rawCachesRef = React.useRef(
    new Map<string, MultimodalRawMessageWindowCache>()
  );
  const decodedTfCacheRef = React.useRef(new Map<string, DecodedTransform[]>());
  const decodedTransformSampleSetsRef = React.useRef(
    new Map<string, TransformSampleSet>()
  );
  const decodedLocationCacheRef = React.useRef(
    new Map<string, DecodedPoseSample | DecodedNavSatFixSample | null>()
  );
  const decodedImageAnnotationsCacheRef = React.useRef(
    new Map<string, ReturnType<typeof decodeFoxgloveImageAnnotationsPayload>>()
  );
  const decodedCameraCalibrationCacheRef = React.useRef(
    new Map<string, DecodedFoxgloveCameraCalibration>()
  );
  const navSatAnchorRef = React.useRef(
    new Map<string, DecodedNavSatFixSample>()
  );
  const streamSamplesRef = React.useRef(
    new Map<string, MultimodalTimelineSample[]>()
  );
  const streamTimestampsRef = React.useRef(new Map<string, number[]>());
  const transformGraphCacheRef =
    React.useRef<MultimodalTransformGraphCache | null>(null);
  const renderGenerationRef = React.useRef(0);
  const currentRenderTimeRef = React.useRef(0);
  const didMarkFirstPanelRenderRef = React.useRef(false);
  const didMarkFirstUsefulPaintRef = React.useRef(false);
  const didMarkFullTimelineReadyRef = React.useRef(false);
  const didMarkHydratedPanelsRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      imageCachesRef.current.forEach((cache) => cache.dispose());
      renderable3dCachesRef.current.forEach((cache) => cache.dispose());
      rawCachesRef.current.forEach((cache) => cache.dispose());
      decodedImageAnnotationsCacheRef.current.clear();
      decodedCameraCalibrationCacheRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  React.useEffect(() => {
    workspaceStateRef.current = workspaceState;
    const initialStates = createInitialPanelStates(
      workspaceState?.panels ?? []
    );
    panelStatesRef.current = initialStates;
    setPanelStates(initialStates);
  }, [workspaceState?.sceneId, panels]);

  React.useEffect(() => {
    imageCachesRef.current.forEach((cache) => cache.dispose());
    renderable3dCachesRef.current.forEach((cache) => cache.dispose());
    rawCachesRef.current.forEach((cache) => cache.dispose());
    imageCachesRef.current.clear();
    renderable3dCachesRef.current.clear();
    rawCachesRef.current.clear();
    decodedTfCacheRef.current.clear();
    decodedTransformSampleSetsRef.current.clear();
    decodedLocationCacheRef.current.clear();
    decodedImageAnnotationsCacheRef.current.clear();
    decodedCameraCalibrationCacheRef.current.clear();
    navSatAnchorRef.current.clear();
    streamSamplesRef.current.clear();
    streamTimestampsRef.current.clear();
    transformGraphCacheRef.current = null;
    setIsBootstrapping(false);
    didMarkFirstPanelRenderRef.current = false;
    didMarkFirstUsefulPaintRef.current = false;
    didMarkFullTimelineReadyRef.current = false;
    didMarkHydratedPanelsRef.current = false;
    markPerformance("multimodal:workspace-ready");
  }, [catalog?.sceneId]);

  React.useEffect(() => {
    const streamSamples = new Map<string, MultimodalTimelineSample[]>();
    const streamTimestamps = new Map<string, number[]>();

    (timeline?.streams ?? []).forEach((stream) => {
      streamSamples.set(stream.streamId, stream.samples);
      streamTimestamps.set(
        stream.streamId,
        stream.timestampsNs ??
          stream.samples.map((sample) => sample.timestampNs)
      );
    });

    streamSamplesRef.current = streamSamples;
    streamTimestampsRef.current = streamTimestamps;
  }, [timeline]);

  const getOrCreateImageCache = React.useCallback((streamId: string) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog) {
      return null;
    }

    const existing = imageCachesRef.current.get(streamId);
    if (existing) {
      return existing;
    }

    const streamDescriptor =
      currentCatalog.streams.find((stream) => stream.streamId === streamId) ??
      null;
    if (!streamDescriptor) {
      return null;
    }

    const cache = new MultimodalImageBufferCache({
      datasetId: currentCatalog.datasetId,
      sampleId: currentCatalog.sampleId,
      sceneId: currentCatalog.sceneId,
      streamId,
      schemaName: streamDescriptor.schemaName,
      mediaField: currentCatalog.mediaField,
      sourceKind: currentCatalog.sourceKind,
      sceneRange: currentCatalog.timeRange,
    });
    imageCachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const getOrCreateRenderable3dCache = React.useCallback((streamId: string) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog) {
      return null;
    }

    const existing = renderable3dCachesRef.current.get(streamId);
    if (existing) {
      return existing;
    }

    const streamDescriptor =
      currentCatalog.streams.find((stream) => stream.streamId === streamId) ??
      null;
    if (!streamDescriptor) {
      return null;
    }

    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: currentCatalog.datasetId,
      sampleId: currentCatalog.sampleId,
      sceneId: currentCatalog.sceneId,
      streamId,
      schemaName: streamDescriptor.schemaName,
      mediaField: currentCatalog.mediaField,
      sourceKind: currentCatalog.sourceKind,
      sceneRange: currentCatalog.timeRange,
    });
    renderable3dCachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const getOrCreateRawCache = React.useCallback((streamId: string) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog) {
      return null;
    }

    const existing = rawCachesRef.current.get(streamId);
    if (existing) {
      return existing;
    }

    const cache = new MultimodalRawMessageWindowCache({
      datasetId: currentCatalog.datasetId,
      sampleId: currentCatalog.sampleId,
      sceneId: currentCatalog.sceneId,
      streamId,
      mediaField: currentCatalog.mediaField,
      sourceKind: currentCatalog.sourceKind,
      sceneRange: currentCatalog.timeRange,
    });
    rawCachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const getStreamDescriptor = React.useCallback((streamId: string) => {
    return (
      catalogRef.current?.streams.find(
        (stream) => stream.streamId === streamId
      ) ?? null
    );
  }, []);

  const getCachedSyncSamples = React.useCallback(
    (streamId: string): MultimodalTimelineSample[] => {
      const timelineSamples = streamSamplesRef.current.get(streamId);
      if (timelineSamples?.length) {
        return timelineSamples;
      }

      const descriptor = getStreamDescriptor(streamId);
      if (!descriptor) {
        return [];
      }

      if (isImageStream(descriptor)) {
        return getOrCreateImageCache(streamId)?.getSyncSamples() ?? [];
      }

      if (is3dStream(descriptor)) {
        return getOrCreateRenderable3dCache(streamId)?.getSyncSamples() ?? [];
      }

      return getOrCreateRawCache(streamId)?.getSyncSamples() ?? [];
    },
    [
      getOrCreateImageCache,
      getOrCreateRawCache,
      getOrCreateRenderable3dCache,
      getStreamDescriptor,
    ]
  );

  const getCachedSyncTimestamps = React.useCallback(
    (streamId: string): number[] => {
      const timelineTimestamps = streamTimestampsRef.current.get(streamId);
      if (timelineTimestamps?.length) {
        return timelineTimestamps;
      }

      const descriptor = getStreamDescriptor(streamId);
      if (!descriptor) {
        return [];
      }

      if (isImageStream(descriptor)) {
        return getOrCreateImageCache(streamId)?.getSyncTimestamps() ?? [];
      }

      if (is3dStream(descriptor)) {
        return (
          getOrCreateRenderable3dCache(streamId)?.getSyncTimestamps() ?? []
        );
      }

      return getOrCreateRawCache(streamId)?.getSyncTimestamps() ?? [];
    },
    [
      getOrCreateImageCache,
      getOrCreateRawCache,
      getOrCreateRenderable3dCache,
      getStreamDescriptor,
    ]
  );

  const primeBootstrapResponse = React.useCallback(
    (response: MultimodalRawBufferResponse) => {
      response.streams.forEach((stream) => {
        const descriptor = getStreamDescriptor(stream.streamId);
        if (!descriptor) {
          return;
        }

        if (isImageStream(descriptor)) {
          getOrCreateImageCache(stream.streamId)?.primeMessages(
            stream.messages,
            response.window
          );
          return;
        }

        if (is3dStream(descriptor)) {
          getOrCreateRenderable3dCache(stream.streamId)?.primeMessages(
            stream.messages,
            response.window
          );
          return;
        }

        getOrCreateRawCache(stream.streamId)?.primeMessages(
          stream.messages,
          response.window
        );
      });
    },
    [
      getOrCreateImageCache,
      getOrCreateRawCache,
      getOrCreateRenderable3dCache,
      getStreamDescriptor,
    ]
  );

  const getTransformSampleSet = React.useCallback(
    (streamId: string): TransformSampleSet => {
      const descriptor = getStreamDescriptor(streamId);
      if (!descriptor) {
        return { version: 0, samples: [] };
      }

      const rawCache = getOrCreateRawCache(streamId);
      const cacheVersion = rawCache?.getVersion() ?? 0;
      const cachedSampleSet =
        decodedTransformSampleSetsRef.current.get(streamId);
      if (cachedSampleSet && cachedSampleSet.version === cacheVersion) {
        return cachedSampleSet;
      }

      const rawMessages = rawCache?.getMessages() ?? [];
      const transformSamples: TransformSample[] = [];

      rawMessages.forEach((message) => {
        let decoded = decodedTfCacheRef.current.get(message.messageId);
        if (!decoded) {
          decoded = BUILTIN_SCHEMA_CODEC_REGISTRY.decodeTransformPayload(
            descriptor.schemaName,
            message.payload
          );
          decodedTfCacheRef.current.set(message.messageId, decoded);
        }

        transformSamples.push(
          ...decoded.map((transform, index) => ({
            ...transform,
            timestampNs: message.syncTimestampNs,
            cacheKey: `${message.messageId}:${index}`,
          }))
        );
      });

      transformSamples.sort(
        (left, right) =>
          left.timestampNs - right.timestampNs ||
          left.cacheKey.localeCompare(right.cacheKey)
      );

      const sampleSet = {
        version: cacheVersion,
        samples: transformSamples,
      };
      decodedTransformSampleSetsRef.current.set(streamId, sampleSet);
      return sampleSet;
    },
    [getOrCreateRawCache, getStreamDescriptor]
  );

  const getTransformGraphSnapshot = React.useCallback(
    (targetTimestampNs: number) => {
      if (!transformStreamIds.length) {
        return EMPTY_TRANSFORM_GRAPH_SNAPSHOT;
      }

      const cache =
        transformGraphCacheRef.current ??
        new MultimodalTransformGraphCache({
          getTransformSampleSet,
        });
      transformGraphCacheRef.current = cache;
      return cache.getSnapshot(transformStreamIds, targetTimestampNs);
    },
    [getTransformSampleSet, transformStreamIds]
  );

  const commitPanelStates = React.useCallback(
    (nextStates: Record<string, Partial<MultimodalPlaybackPanelState>>) => {
      if (!mountedRef.current || !Object.keys(nextStates).length) {
        return;
      }

      setPanelStates((current) => {
        let didChange = false;
        const updatedStates = { ...current };

        Object.entries(nextStates).forEach(([panelId, partialState]) => {
          const panel =
            workspaceStateRef.current?.panels.find(
              (candidate) => candidate.panelId === panelId
            ) ?? null;
          const fallbackState = panel
            ? createInitialPanelState(panel)
            : createInitialPanelState({
                panelId,
                archetype: "image",
                title: "",
                renderStreamId: null,
                visibleStreamIds: [],
                frameConfig: {
                  fixedFrameId: null,
                  displayFrameId: null,
                  followMode: "off",
                  locationStreamId: null,
                  enuFrameId: null,
                },
                sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
              });
          const previousState = current[panelId] ?? fallbackState;
          const mergedState = {
            ...previousState,
            ...partialState,
          };

          if (!panelStateEqual(previousState, mergedState)) {
            updatedStates[panelId] = mergedState;
            didChange = true;
          }
        });

        if (!didChange) {
          return current;
        }

        panelStatesRef.current = updatedStates;
        return updatedStates;
      });
    },
    []
  );

  const ensureStreamRange = React.useCallback(
    async (
      streamIds: string[],
      timeRange: [number, number],
      options: { expand?: boolean } = {}
    ) => {
      if (!streamIds.length) {
        return;
      }

      const currentCatalog = catalogRef.current;
      if (!currentCatalog) {
        return;
      }

      const sharedRange = {
        startNs: Math.min(timeRange[0], timeRange[1]),
        endNs: Math.max(timeRange[0], timeRange[1]),
      };
      const expandedSharedRange =
        options.expand === false
          ? sharedRange
          : expandPrefetchRange(currentCatalog.timeRange, sharedRange);
      const prefetchAnchorNs = Math.round(
        (sharedRange.startNs + sharedRange.endNs) / 2
      );

      const streamLookup = new Map(
        currentCatalog.streams.map((stream) => [stream.streamId, stream])
      );

      await Promise.all(
        streamIds.map(async (streamId) => {
          const descriptor = streamLookup.get(streamId);
          if (!descriptor) {
            return;
          }

          const streamTimestamps = getCachedSyncTimestamps(streamId);

          if (isImageStream(descriptor) || is3dStream(descriptor)) {
            const startNs =
              findNearestTimestampAtOrBefore(
                streamTimestamps,
                expandedSharedRange.startNs
              ) ??
              findNearestTimestampAtOrAfter(
                streamTimestamps,
                expandedSharedRange.startNs
              );
            const endNs =
              findNearestTimestampAtOrBefore(
                streamTimestamps,
                expandedSharedRange.endNs
              ) ??
              findNearestTimestampAtOrAfter(
                streamTimestamps,
                expandedSharedRange.endNs
              );

            if (startNs === null || endNs === null || startNs > endNs) {
              return;
            }

            if (descriptor.kind === "image") {
              const cache = getOrCreateImageCache(streamId);
              await cache?.ensureRange({
                startNs,
                endNs,
              });
              const warmSample = findPlaybackSampleForNearestSync(
                getCachedSyncSamples(streamId),
                prefetchAnchorNs
              );
              if (cache && warmSample) {
                void cache.warmMessagesAroundLogTime(warmSample.logTimeNs, {
                  aheadCount: MULTIMODAL_IMAGE_DECODE_LOOKAHEAD_COUNT,
                });
              }
              return;
            }

            const cache = getOrCreateRenderable3dCache(streamId);
            await cache?.ensureRange({
              startNs,
              endNs,
            });
            const warmSample = findPlaybackSampleForNearestSync(
              getCachedSyncSamples(streamId),
              prefetchAnchorNs
            );
            if (cache && warmSample) {
              void cache.warmMessagesAroundLogTime(warmSample.logTimeNs, {
                aheadCount: MULTIMODAL_POINTCLOUD_DECODE_LOOKAHEAD_COUNT,
              });
            }
            return;
          }

          await getOrCreateRawCache(streamId)?.ensureRange(expandedSharedRange);
        })
      );
    },
    [
      getCachedSyncSamples,
      getCachedSyncTimestamps,
      getOrCreateImageCache,
      getOrCreateRenderable3dCache,
      getOrCreateRawCache,
    ]
  );

  const ensurePlaybackRange = React.useCallback(
    async (timeRange: [number, number], options: { expand?: boolean } = {}) => {
      await ensureStreamRange(criticalTrackedStreamIds, timeRange, options);
      void ensureStreamRange(
        backgroundTrackedStreamIds,
        timeRange,
        options
      ).catch((prefetchError) => {
        console.error(
          "Failed to prefetch background multimodal streams",
          prefetchError
        );
      });
    },
    [backgroundTrackedStreamIds, criticalTrackedStreamIds, ensureStreamRange]
  );

  const getBufferReadiness = React.useCallback(
    (targetTimestampNs: number): BufferReadiness => {
      const currentCatalog = catalogRef.current;
      if (!currentCatalog || !timelineRenderStreamIds.length) {
        return "ready";
      }

      const streamLookup = new Map(
        currentCatalog.streams.map((stream) => [stream.streamId, stream])
      );
      let sawMissing = false;

      for (const streamId of timelineRenderStreamIds) {
        const stream = streamLookup.get(streamId);
        if (!stream) {
          continue;
        }

        const samples = getCachedSyncSamples(streamId);
        const selectedSample = findPlaybackSampleForNearestSync(
          samples,
          targetTimestampNs
        );
        if (!selectedSample) {
          sawMissing = true;
          continue;
        }

        const readiness = isImageStream(stream)
          ? getOrCreateImageCache(streamId)?.getMessageReadiness(
              selectedSample.logTimeNs
            ) ?? "missing"
          : is3dStream(stream)
          ? getOrCreateRenderable3dCache(streamId)?.getMessageReadiness(
              selectedSample.logTimeNs
            ) ?? "missing"
          : "ready";

        if (readiness === "loading") {
          return "loading";
        }

        if (readiness === "missing") {
          sawMissing = true;
        }
      }

      return sawMissing ? "missing" : "ready";
    },
    [
      getCachedSyncSamples,
      getOrCreateImageCache,
      getOrCreateRenderable3dCache,
      timelineRenderStreamIds,
    ]
  );
  const getBufferedRanges = React.useCallback((): Buffers => {
    if (!timelineRenderStreamIds.length) {
      return [];
    }

    const timestampsNs = hasFullTimeline
      ? timeline?.timestampsNs ?? []
      : Array.from(
          new Set(
            timelineRenderStreamIds.flatMap((streamId) =>
              getCachedSyncTimestamps(streamId)
            )
          )
        ).sort((left, right) => left - right);

    if (!timestampsNs.length) {
      return getBufferReadiness(0) === "ready"
        ? ([[0, timelineDurationNs]] as Buffers)
        : [];
    }

    const readyRanges: Array<readonly [number, number]> = [];
    const segmentStarts = [0, ...timestampsNs];

    segmentStarts.forEach((segmentStartNs, index) => {
      const segmentEndNs =
        timestampsNs[index] ?? Math.max(timelineDurationNs, segmentStartNs);
      if (segmentEndNs < segmentStartNs) {
        return;
      }

      if (getBufferReadiness(segmentStartNs) === "ready") {
        readyRanges.push([segmentStartNs, segmentEndNs]);
      }
    });

    return getMergedBufferedRanges(readyRanges);
  }, [
    getCachedSyncTimestamps,
    getBufferReadiness,
    hasFullTimeline,
    timelineRenderStreamIds,
    timeline?.timestampsNs,
    timelineDurationNs,
  ]);

  const renderFrame = React.useCallback(
    async (targetTimestamp: number) => {
      const currentCatalog = catalogRef.current;
      const currentWorkspaceState = workspaceStateRef.current;
      if (!currentCatalog || !currentWorkspaceState) {
        return;
      }

      currentRenderTimeRef.current = targetTimestamp;
      const renderGeneration = renderGenerationRef.current + 1;
      renderGenerationRef.current = renderGeneration;

      const streamLookup = new Map(
        currentCatalog.streams.map((stream) => [stream.streamId, stream])
      );
      const shouldBuildTransformGraph = currentWorkspaceState.panels.some(
        (panel) => {
          return (
            (panel.archetype === "3d" &&
              (Boolean(getPanelAggregationFrameId(panel)) ||
                Boolean(getPanelDisplayFrameId(panel)) ||
                panel.frameConfig.followMode !== "off")) ||
            (panel.archetype === "image" &&
              isImage3dOverlayProjectionEnabled(panel) &&
              panel.visibleStreamIds.some((streamId) => {
                const stream = streamLookup.get(streamId);
                return stream?.schemaName === "foxglove.SceneUpdate";
              }))
          );
        }
      );
      const transformGraphSnapshot =
        shouldBuildTransformGraph && transformStreamIds.length
          ? getTransformGraphSnapshot(targetTimestamp)
          : EMPTY_TRANSFORM_GRAPH_SNAPSHOT;
      const resolveTransform = transformGraphSnapshot.resolveMatrix;

      const nextPanelStates = Object.fromEntries(
        await Promise.all(
          currentWorkspaceState.panels.map(async (panel) => {
            try {
              if (panel.archetype === "image") {
                if (!panel.renderStreamId) {
                  return [
                    panel.panelId,
                    {
                      status: "empty",
                      statusDetail: null,
                      imageFrame: null,
                      sceneFrame: null,
                      messageIds: [],
                      warnings: [],
                      followPose: null,
                      logTimeNs: null,
                      publishTimeNs: null,
                      transformRevision: null,
                    },
                  ] as const;
                }

                const samples = getCachedSyncSamples(panel.renderStreamId);
                const selectedSample = findPlaybackSampleForNearestSync(
                  samples,
                  targetTimestamp
                );
                if (!selectedSample) {
                  return [
                    panel.panelId,
                    {
                      status: "empty",
                      statusDetail:
                        "No synchronized image frame is available yet",
                      imageFrame: null,
                      sceneFrame: null,
                      messageIds: [],
                      warnings: [],
                      followPose: null,
                      transformRevision: null,
                    },
                  ] as const;
                }

                const currentPanelState = panelStatesRef.current[panel.panelId];
                const cache = getOrCreateImageCache(panel.renderStreamId);
                const message = cache?.getMessageForLogTime(
                  selectedSample.logTimeNs
                );
                if (!cache || !message) {
                  if (hasRenderableContent(currentPanelState)) {
                    return [panel.panelId, {}] as const;
                  }

                  return [
                    panel.panelId,
                    {
                      status: "loading",
                      statusDetail: `Buffering image stream ${panel.renderStreamId}`,
                      imageFrame: null,
                      sceneFrame: null,
                      messageIds: [],
                      warnings: [],
                      followPose: null,
                      transformRevision: null,
                    },
                  ] as const;
                }

                void cache.warmMessagesAroundLogTime(message.logTimeNs, {
                  aheadCount: MULTIMODAL_IMAGE_DECODE_LOOKAHEAD_COUNT,
                });
                const frame = await cache.decodeMessage(message);
                const overlays: Image2dOverlayPrimitive[] = [];
                const warnings: string[] = [];
                const supportMessageIds: string[] = [];
                const shouldProject3dOverlays =
                  isImage3dOverlayProjectionEnabled(panel);
                const selectedSceneUpdates: Array<{
                  message: MultimodalRawMessage;
                  streamId: string;
                }> = [];
                let calibration: DecodedFoxgloveCameraCalibration | null = null;

                for (const supportStreamId of panel.visibleStreamIds) {
                  const descriptor = streamLookup.get(supportStreamId);
                  if (
                    !descriptor ||
                    !shouldTrackImageSupportStream(panel, descriptor)
                  ) {
                    continue;
                  }

                  const supportSamples = getCachedSyncSamples(supportStreamId);
                  const selectedSupportSample =
                    findPlaybackSampleForNearestSync(
                      supportSamples,
                      targetTimestamp
                    );
                  if (!selectedSupportSample) {
                    continue;
                  }

                  if (is3dStream(descriptor)) {
                    const supportCache =
                      getOrCreateRenderable3dCache(supportStreamId);
                    const supportMessage = supportCache?.getMessageForLogTime(
                      selectedSupportSample.logTimeNs
                    );
                    if (!supportCache || !supportMessage) {
                      continue;
                    }

                    supportMessageIds.push(supportMessage.messageId);
                    void supportCache.warmMessagesAroundLogTime(
                      supportMessage.logTimeNs,
                      {
                        aheadCount:
                          MULTIMODAL_POINTCLOUD_DECODE_LOOKAHEAD_COUNT,
                      }
                    );

                    if (descriptor.schemaName === "foxglove.SceneUpdate") {
                      selectedSceneUpdates.push({
                        message: supportMessage,
                        streamId: supportStreamId,
                      });
                    }

                    continue;
                  }

                  const supportCache = getOrCreateRawCache(supportStreamId);
                  const supportMessage = supportCache?.getMessageForLogTime(
                    selectedSupportSample.logTimeNs
                  );
                  if (!supportCache || !supportMessage) {
                    continue;
                  }

                  supportMessageIds.push(supportMessage.messageId);

                  if (descriptor.schemaName === "foxglove.CameraCalibration") {
                    let decodedCalibration =
                      decodedCameraCalibrationCacheRef.current.get(
                        supportMessage.messageId
                      );
                    if (!decodedCalibration) {
                      decodedCalibration =
                        decodeFoxgloveCameraCalibrationPayload(
                          supportMessage.payload
                        );
                      decodedCameraCalibrationCacheRef.current.set(
                        supportMessage.messageId,
                        decodedCalibration
                      );
                    }
                    calibration = decodedCalibration;
                    continue;
                  }

                  if (descriptor.schemaName === "foxglove.ImageAnnotations") {
                    let decodedAnnotations =
                      decodedImageAnnotationsCacheRef.current.get(
                        supportMessage.messageId
                      );
                    if (!decodedAnnotations) {
                      decodedAnnotations =
                        decodeFoxgloveImageAnnotationsPayload(
                          supportMessage.payload
                        );
                      decodedImageAnnotationsCacheRef.current.set(
                        supportMessage.messageId,
                        decodedAnnotations
                      );
                    }

                    overlays.push(
                      ...prefixImageOverlays(
                        decodedAnnotations.overlays,
                        `${supportStreamId}:${supportMessage.messageId}`
                      )
                    );
                  }
                }

                if (
                  shouldProject3dOverlays &&
                  selectedSceneUpdates.length > 0 &&
                  !calibration
                ) {
                  warnings.push(
                    "SceneUpdate overlays require a camera calibration support stream"
                  );
                }

                if (shouldProject3dOverlays && calibration) {
                  for (const selectedSceneUpdate of selectedSceneUpdates) {
                    const supportCache = getOrCreateRenderable3dCache(
                      selectedSceneUpdate.streamId
                    );
                    if (!supportCache) {
                      continue;
                    }

                    const calibrationFrameId = calibration.frameId || null;
                    const projectedScene = calibrationFrameId
                      ? await supportCache.decodeMessageInFrame(
                          selectedSceneUpdate.message,
                          {
                            targetFrameId: calibrationFrameId,
                            transformRevision: transformGraphSnapshot.revision,
                            resolveTransformMatrix: resolveTransform,
                            warningContext: selectedSceneUpdate.streamId,
                          }
                        )
                      : await supportCache.decodeMessage(
                          selectedSceneUpdate.message
                        );
                    warnings.push(...(projectedScene.warnings ?? []));

                    if (!projectedScene.primitives.length) {
                      continue;
                    }

                    overlays.push(
                      ...prefixImageOverlays(
                        projectSceneFrameToImageOverlays(
                          projectedScene,
                          calibration
                        ),
                        `${selectedSceneUpdate.streamId}:${selectedSceneUpdate.message.messageId}`
                      )
                    );
                  }
                }

                const nextWarnings = dedupeStrings(warnings);
                const imageFrame: Image2dFrame =
                  overlays.length || nextWarnings.length
                    ? {
                        ...frame,
                        overlays: overlays.length ? overlays : undefined,
                        warnings: nextWarnings.length
                          ? nextWarnings
                          : undefined,
                      }
                    : frame;

                return [
                  panel.panelId,
                  {
                    status: "ready",
                    statusDetail: null,
                    imageFrame,
                    sceneFrame: null,
                    colorMode: "rgb",
                    messageIds: dedupeStrings([
                      message.messageId,
                      ...supportMessageIds,
                    ]),
                    warnings: nextWarnings,
                    followPose: null,
                    logTimeNs: selectedSample.logTimeNs,
                    publishTimeNs: selectedSample.publishTimeNs,
                    transformRevision: shouldProject3dOverlays
                      ? transformGraphSnapshot.revision
                      : 0,
                    error: null,
                  },
                ] as const;
              }

              const warnings: string[] = [];
              const currentPanelState = panelStatesRef.current[panel.panelId];
              const missingBufferedStreams: string[] = [];
              const selectedMessages: Array<{
                streamId: string;
                color: string;
                sample: MultimodalTimelineSample;
                message: ReturnType<
                  MultimodalRenderable3dBufferCache["getMessageForLogTime"]
                >;
              }> = [];
              const resolvedFrames: Array<{
                frame: MultimodalDecodedScene3dFrame;
                streamId: string;
                color: string;
              }> = [];
              let logTimeNs: number | null = null;
              let publishTimeNs: number | null = null;

              for (const streamId of panel.visibleStreamIds) {
                const samples = getCachedSyncSamples(streamId);
                const selectedSample = findPlaybackSampleForNearestSync(
                  samples,
                  targetTimestamp
                );
                if (!selectedSample) {
                  warnings.push(`No frame available for ${streamId}`);
                  continue;
                }

                const cache = getOrCreateRenderable3dCache(streamId);
                const message = cache?.getMessageForLogTime(
                  selectedSample.logTimeNs
                );
                if (!cache || !message) {
                  warnings.push(`No buffered frame available for ${streamId}`);
                  missingBufferedStreams.push(streamId);
                  continue;
                }

                selectedMessages.push({
                  streamId,
                  color: getStreamColor(streamId),
                  sample: selectedSample,
                  message,
                });
                logTimeNs = Math.max(logTimeNs ?? 0, selectedSample.logTimeNs);
                publishTimeNs = Math.max(
                  publishTimeNs ?? 0,
                  selectedSample.publishTimeNs
                );
              }

              const selectedMessageIds = selectedMessages.map(
                ({ message }) => message!.messageId
              );
              const displayFrameId = getPanelDisplayFrameId(panel);
              if (
                currentPanelState?.status === "ready" &&
                currentPanelState.sceneFrame &&
                arraysEqual(currentPanelState.messageIds, selectedMessageIds) &&
                currentPanelState.logTimeNs === logTimeNs &&
                currentPanelState.publishTimeNs === publishTimeNs &&
                currentPanelState.transformRevision ===
                  transformGraphSnapshot.revision &&
                (currentPanelState.sceneFrame.frameId ?? null) ===
                  (displayFrameId ?? null) &&
                currentPanelState.followPose === null &&
                panel.frameConfig.followMode === "off" &&
                !currentPanelState.warnings.length
              ) {
                return [panel.panelId, {}] as const;
              }

              for (const selectedMessage of selectedMessages) {
                const cache = getOrCreateRenderable3dCache(
                  selectedMessage.streamId
                );
                if (!cache || !selectedMessage.message) {
                  continue;
                }

                void cache.warmMessagesAroundLogTime(
                  selectedMessage.message.logTimeNs,
                  {
                    aheadCount: MULTIMODAL_POINTCLOUD_DECODE_LOOKAHEAD_COUNT,
                  }
                );
                const decoded = await cache.decodeMessage(
                  selectedMessage.message
                );
                const aggregationFrameId = getPanelAggregationFrameId(panel);
                const frame = aggregationFrameId
                  ? await cache.decodeMessageInFrame(selectedMessage.message, {
                      targetFrameId: aggregationFrameId,
                      transformRevision: transformGraphSnapshot.revision,
                      resolveTransformMatrix: resolveTransform,
                      warningContext: selectedMessage.streamId,
                    })
                  : decoded;
                warnings.push(...(frame.warnings ?? []));
                if (!frame.primitives.length) {
                  continue;
                }

                resolvedFrames.push({
                  frame,
                  streamId: selectedMessage.streamId,
                  color: selectedMessage.color,
                });
              }

              if (!resolvedFrames.length) {
                const nextWarnings = dedupeStrings(warnings);
                return [
                  panel.panelId,
                  {
                    status: hasRenderableContent(currentPanelState)
                      ? "ready"
                      : missingBufferedStreams.length
                      ? "loading"
                      : "empty",
                    statusDetail: missingBufferedStreams.length
                      ? `Buffering 3D streams ${missingBufferedStreams.join(
                          ", "
                        )}`
                      : null,
                    sceneFrame: currentPanelState?.sceneFrame ?? null,
                    imageFrame: null,
                    messageIds: [],
                    warnings: nextWarnings,
                    followPose: null,
                    logTimeNs,
                    publishTimeNs,
                    transformRevision: transformGraphSnapshot.revision,
                  },
                ] as const;
              }

              let followPose = null;
              const locationStreamId = panel.frameConfig.locationStreamId;
              if (
                panel.frameConfig.followMode !== "off" &&
                locationStreamId &&
                locationStreamIds.includes(locationStreamId)
              ) {
                const locationSamples = getCachedSyncSamples(locationStreamId);
                const selectedLocationSample = findPlaybackSampleForNearestSync(
                  locationSamples,
                  targetTimestamp
                );
                const rawCache = getOrCreateRawCache(locationStreamId);
                const message =
                  selectedLocationSample !== null
                    ? rawCache?.getMessageForLogTime(
                        selectedLocationSample.logTimeNs
                      )
                    : null;
                const streamDescriptor = streamLookup.get(locationStreamId);
                if (streamDescriptor && message) {
                  let decodedLocation = decodedLocationCacheRef.current.get(
                    message.messageId
                  );
                  if (decodedLocation === undefined) {
                    decodedLocation = decodeLocationPayload(
                      streamDescriptor.schemaName,
                      message.payload
                    );
                    decodedLocationCacheRef.current.set(
                      message.messageId,
                      decodedLocation
                    );
                  }

                  if (
                    decodedLocation &&
                    "latitude" in decodedLocation &&
                    panel.frameConfig.enuFrameId
                  ) {
                    if (!navSatAnchorRef.current.has(locationStreamId)) {
                      navSatAnchorRef.current.set(
                        locationStreamId,
                        decodedLocation
                      );
                    }

                    followPose = createFollowPoseFromNavSat(
                      decodedLocation,
                      navSatAnchorRef.current.get(locationStreamId)
                    );
                  } else if (decodedLocation && "position" in decodedLocation) {
                    let normalizedLocation = decodedLocation;
                    const aggregationFrameId =
                      getPanelAggregationFrameId(panel);
                    if (
                      aggregationFrameId &&
                      normalizedLocation.frameId &&
                      normalizedLocation.frameId !== aggregationFrameId
                    ) {
                      const matrix = resolveTransform(
                        normalizedLocation.frameId,
                        aggregationFrameId
                      );
                      if (matrix) {
                        normalizedLocation = transformPoseSample(
                          normalizedLocation,
                          matrix,
                          aggregationFrameId
                        );
                      }
                    }

                    const displayFrameId = getPanelDisplayFrameId(panel);
                    if (
                      displayFrameId &&
                      normalizedLocation.frameId &&
                      normalizedLocation.frameId !== displayFrameId
                    ) {
                      const matrix = resolveTransform(
                        normalizedLocation.frameId,
                        displayFrameId
                      );
                      if (matrix) {
                        normalizedLocation = transformPoseSample(
                          normalizedLocation,
                          matrix,
                          displayFrameId
                        );
                      }
                    }
                    followPose = applyFollowMode(
                      createFollowPoseFromPose(normalizedLocation),
                      panel.frameConfig.followMode
                    );
                  }
                }
              }

              if (
                followPose === null &&
                panel.frameConfig.followMode !== "off" &&
                !panel.frameConfig.locationStreamId
              ) {
                const displayFrameId = getPanelDisplayFrameId(panel);
                const followFrameId =
                  catalog && displayFrameId
                    ? getPanelFollowFrameId(catalog, panel)
                    : null;
                if (displayFrameId && followFrameId) {
                  const matrix = resolveTransform(
                    followFrameId,
                    displayFrameId
                  );
                  if (matrix) {
                    followPose = applyFollowMode(
                      createFollowPoseFromPose(
                        transformPoseSample(
                          {
                            frameId: followFrameId,
                            position: [0, 0, 0],
                            orientation: [0, 0, 0, 1],
                          },
                          matrix,
                          displayFrameId
                        )
                      ),
                      panel.frameConfig.followMode
                    );
                  }
                }
              }

              const merged = mergeScene3dFrames(resolvedFrames);
              let sceneFrame = merged.frame;
              if (
                sceneFrame &&
                displayFrameId &&
                sceneFrame.frameId &&
                sceneFrame.frameId !== displayFrameId
              ) {
                const matrix = resolveTransform(
                  sceneFrame.frameId,
                  displayFrameId
                );
                if (matrix) {
                  sceneFrame = applyTransformToScene3dFrame(
                    sceneFrame,
                    matrix,
                    displayFrameId
                  );
                } else {
                  warnings.push(
                    `No transform from ${sceneFrame.frameId} to ${displayFrameId} for ${panel.panelId}`
                  );
                }
              }
              const nextWarnings = dedupeStrings(warnings);
              return [
                panel.panelId,
                {
                  status: sceneFrame ? "ready" : "empty",
                  statusDetail: null,
                  sceneFrame,
                  imageFrame: null,
                  colorMode: merged.colorMode,
                  messageIds: resolvedFrames.map(
                    ({ frame }) => frame.messageId
                  ),
                  warnings: nextWarnings,
                  followPose,
                  logTimeNs,
                  publishTimeNs,
                  transformRevision: transformGraphSnapshot.revision,
                  error: null,
                },
              ] as const;
            } catch (renderError) {
              return [
                panel.panelId,
                {
                  status: "error",
                  statusDetail: null,
                  transformRevision: null,
                  error: normalizeError(renderError),
                },
              ] as const;
            }
          })
        )
      );

      if (
        !mountedRef.current ||
        renderGeneration !== renderGenerationRef.current
      ) {
        return;
      }

      commitPanelStates(nextPanelStates);
    },
    [
      commitPanelStates,
      getCachedSyncSamples,
      getOrCreateImageCache,
      getOrCreateRenderable3dCache,
      getOrCreateRawCache,
      getTransformGraphSnapshot,
      locationStreamIds,
      transformStreamIds,
    ]
  );

  React.useEffect(() => {
    if (!catalog || !workspaceState || !bootstrapPlan) {
      return;
    }

    let isCurrent = true;
    const criticalBootstrapStreamIds = dedupeStrings([
      ...bootstrapPlan.criticalRenderStreamIds,
      ...bootstrapPlan.criticalSupportStreamIds,
    ]);
    const backgroundBootstrapStreamIds = dedupeStrings([
      ...bootstrapPlan.nonCriticalRenderStreamIds,
      ...bootstrapPlan.nonCriticalSupportStreamIds,
    ]);

    setIsBootstrapping(true);
    markPerformance("multimodal:bootstrap-fetch:start");

    const criticalPromise =
      criticalBootstrapStreamIds.length ||
      bootstrapPlan.transformStreamIds.length ||
      bootstrapPlan.locationStreamIds.length
        ? fetchMultimodalBootstrapWindow({
            datasetId: catalog.datasetId,
            sampleId: catalog.sampleId,
            request: {
              mediaField: catalog.mediaField,
              sourceKind: catalog.sourceKind,
              anchorTimeNs: bootstrapPlan.anchorTimeNs,
              renderStreamIds: criticalBootstrapStreamIds,
              transformStreamIds: bootstrapPlan.transformStreamIds,
              locationStreamIds: bootstrapPlan.locationStreamIds,
              transformWindowNs: MULTIMODAL_BOOTSTRAP_TRANSFORM_WINDOW_NS,
            },
          })
        : Promise.resolve(null);
    const imagePromise = backgroundBootstrapStreamIds.length
      ? fetchMultimodalBootstrapWindow({
          datasetId: catalog.datasetId,
          sampleId: catalog.sampleId,
          request: {
            mediaField: catalog.mediaField,
            sourceKind: catalog.sourceKind,
            anchorTimeNs: bootstrapPlan.anchorTimeNs,
            renderStreamIds: backgroundBootstrapStreamIds,
            transformStreamIds: [],
            locationStreamIds: [],
          },
        })
      : Promise.resolve(null);

    void criticalPromise
      .then(async (response) => {
        if (!isCurrent) {
          return;
        }

        if (response) {
          primeBootstrapResponse(response);
          markPerformance("multimodal:bootstrap-fetch:end");
          measurePerformance(
            "multimodal:bootstrap-fetch",
            "multimodal:bootstrap-fetch:start",
            "multimodal:bootstrap-fetch:end"
          );
        }
        await renderFrame(currentRenderTimeRef.current);
        if (!isCurrent) {
          return;
        }

        setIsBootstrapping(false);
        void ensurePlaybackRange(
          [bootstrapPlan.anchorTimeNs, bootstrapPlan.anchorTimeNs],
          { expand: false }
        ).then(() => renderFrame(currentRenderTimeRef.current));
      })
      .catch((bootError) => {
        console.error("Failed to bootstrap multimodal workspace", bootError);
        if (isCurrent) {
          setIsBootstrapping(false);
        }
      });

    void imagePromise
      .then(async (response) => {
        if (!response || !isCurrent) {
          return;
        }

        primeBootstrapResponse(response);
        await renderFrame(currentRenderTimeRef.current);
      })
      .catch((bootError) => {
        console.error("Failed to bootstrap Multimodal image panels", bootError);
      });

    return () => {
      isCurrent = false;
    };
  }, [
    bootstrapPlanKey,
    catalog?.datasetId,
    catalog?.mediaField,
    catalog?.sampleId,
    ensurePlaybackRange,
    primeBootstrapResponse,
    renderFrame,
  ]);

  React.useEffect(() => {
    if (!catalog || !workspaceState) {
      return;
    }

    void renderFrame(currentRenderTimeRef.current);
  }, [catalog, panels, renderFrame, workspaceState]);

  React.useEffect(() => {
    if (!hasFullTimeline || didMarkFullTimelineReadyRef.current) {
      return;
    }

    didMarkFullTimelineReadyRef.current = true;
    markPerformance("multimodal:timeline-ready");
    measurePerformance(
      "multimodal:workspace-to-timeline-ready",
      "multimodal:workspace-ready",
      "multimodal:timeline-ready"
    );
    const currentTimeNs = currentRenderTimeRef.current;
    void ensurePlaybackRange(
      [
        currentTimeNs,
        Math.min(timelineDurationNs, currentTimeNs + 1_000_000_000),
      ],
      {
        expand: true,
      }
    ).then(() => renderFrame(currentTimeNs));
  }, [ensurePlaybackRange, hasFullTimeline, renderFrame, timelineDurationNs]);

  React.useEffect(() => {
    const panelStateList = Object.values(panelStates);
    if (!panelStateList.length) {
      return;
    }

    if (
      !didMarkFirstPanelRenderRef.current &&
      panelStateList.some((panelState) => hasRenderableContent(panelState))
    ) {
      didMarkFirstPanelRenderRef.current = true;
      markPerformance("multimodal:first-panel-render");
      measurePerformance(
        "multimodal:workspace-to-first-panel-render",
        "multimodal:workspace-ready",
        "multimodal:first-panel-render"
      );
    }

    if (
      !didMarkFirstUsefulPaintRef.current &&
      panelStateList.some((panelState) => hasRenderableContent(panelState))
    ) {
      didMarkFirstUsefulPaintRef.current = true;
      markPerformance("multimodal:first-useful-paint");
      measurePerformance(
        "multimodal:workspace-to-first-useful-paint",
        "multimodal:workspace-ready",
        "multimodal:first-useful-paint"
      );
    }

    if (
      !didMarkHydratedPanelsRef.current &&
      panelStateList.every((panelState) => isPanelHydrated(panelState))
    ) {
      didMarkHydratedPanelsRef.current = true;
      markPerformance("multimodal:all-panels-hydrated");
      measurePerformance(
        "multimodal:workspace-to-all-panels-hydrated",
        "multimodal:workspace-ready",
        "multimodal:all-panels-hydrated"
      );
    }
  }, [panelStates]);

  const timelineState = useMultimodalExperimentalTimeline(
    timelineName
      ? {
          name: timelineName,
          durationNs: timelineDurationNs,
          tickRate: targetFrameRate,
          coverage: timeline?.timestampsNs ?? [],
          onPrefetchRange: ensurePlaybackRange,
          getBufferReadiness,
          getBufferedRanges,
          isBufferingCritical:
            hasFullTimeline && timelineRenderStreamIds.length > 0,
          canControlPlayback: hasFullTimeline,
          onRenderTime: renderFrame,
        }
      : null
  );

  return {
    timelineName,
    timeline,
    isLoading,
    isBootstrapping,
    error,
    refetch,
    isTimelineInitialized: timelineState.isInitialized,
    hasPlayback: timelineState.hasPlayback,
    canControlPlayback: timelineState.canControlPlayback,
    timelineState,
    panelStates,
  };
}

export type { MultimodalDecodedImageFrame, MultimodalDecodedScene3dFrame };
export type { MultimodalPlaybackPanelState };
