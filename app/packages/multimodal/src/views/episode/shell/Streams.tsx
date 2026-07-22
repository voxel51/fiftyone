import { useEffect, useMemo } from "react";
import { SCENE_SOURCE_TYPE, type ByteSourceDescriptor } from "../../../ir";
import { streamSyncPoliciesForSceneSources } from "../../../scene-inventory";
import { useSceneInventory } from "../../../scene-inventory/react";
import type { EpisodeSession, TransformReadAcceleration } from "../../../ports";
import {
  createEpisodeTransformReadRuntime,
  episodeSourceAccessKey,
} from "../../../runtime";
import {
  idleFrameTransformsState,
  useSetFrameTransformsContext,
} from "../spatial/frame-transforms/context";
import { LocationTracksBridge } from "../map/tracks/context";
import { NumericSeriesBridge } from "../plots/numeric-series-context";
import { PoseTrajectoriesStartupGate } from "../scene/entities/pose-trajectories-context";
import { RawMessageBridge } from "../raw/raw-message-context";
import { SceneUpdateHistoryBridge } from "../scene/entities/scene-update-history-context";
import { useDataStream } from "../playback/data-stream-context";
import {
  type PlaybackFidelityMode,
  type TemporalPolicySettings,
  usePlaybackSettings,
  useTemporalPolicySettings,
} from "../settings/modal/state";
import { useFrameTransforms } from "../spatial/frame-transforms/use-frame-transforms";
import { usePlaybackTimeNs } from "../playback/use-playback-time-ns";
import { useRegisterTiles } from "./use-register-tiles";
import type { TileType } from "../tiles/tile-types";
import { useRegisterDataStream } from "../playback/use-register-data-stream";

const FRAME_TRANSFORM_RANGE_PADDING_NS = 1_000_000_000n;

export interface StreamsProps {
  /** Tile kinds supported by the current manifest, capabilities, and build. */
  availableTileTypes: readonly TileType[];
  /** Shared format-neutral episode session owned by the modal renderer. */
  session: EpisodeSession | null;
  /** Called after every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  /** Byte source currently feeding the playback shell. */
  source: ByteSourceDescriptor | null;
}

/**
 * Non-visual child of PlaybackShell. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider`, derives per-stream
 * sync policies from the source types, then wires the episode data layer
 * (single playback stream, per-stream caches, tile registry).
 */
export function Streams({
  availableTileTypes,
  onPlayheadDataReady,
  session,
  source,
}: StreamsProps) {
  const sources = useSceneInventory();
  const { fidelityMode } = usePlaybackSettings();
  const { temporalPolicy } = useTemporalPolicySettings();
  const numericSeries = session?.numericSeries ?? null;
  const rawRecords = session?.rawRecords ?? null;
  const transformRead = useMemo(
    () => (session ? createEpisodeTransformReadRuntime(session) : null),
    [session],
  );
  const sourceKey = useMemo(
    () => (source ? episodeSourceAccessKey(source) : null),
    [source],
  );

  const streamPolicies = useMemo(
    () => streamSyncPoliciesForSceneSources(sources),
    [sources],
  );
  const allStreams = useMemo(() => sources.map((s) => s.id), [sources]);
  const staleWarningStreams = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type === SCENE_SOURCE_TYPE.IMAGE ||
            s.type === SCENE_SOURCE_TYPE.POINT_CLOUD,
        )
        .map((s) => s.id),
    [sources],
  );
  // Map layers are overlays like annotations: playback must not stall on a
  // one-shot multi-megabyte /map fetch, and a static map is *supposed* to be
  // older than the playhead, so it never earns a stale-media warning.
  const blockingStreams = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type !== SCENE_SOURCE_TYPE.IMAGE_ANNOTATION &&
            s.type !== SCENE_SOURCE_TYPE.SCENE_ANNOTATION &&
            s.type !== SCENE_SOURCE_TYPE.MAP_LAYER &&
            s.type !== SCENE_SOURCE_TYPE.CAMERA_CALIBRATION &&
            s.type !== SCENE_SOURCE_TYPE.POSE &&
            s.type !== SCENE_SOURCE_TYPE.LOCATION &&
            s.type !== SCENE_SOURCE_TYPE.LOG,
        )
        .map((s) => s.id),
    [sources],
  );
  const poseStreams = useMemo(
    () =>
      sources.filter((s) => s.type === SCENE_SOURCE_TYPE.POSE).map((s) => s.id),
    [sources],
  );
  const locationSources = useMemo(
    () => sources.filter((s) => s.type === SCENE_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const sceneAnnotationStreams = useMemo(
    () =>
      sources
        .filter((s) => s.type === SCENE_SOURCE_TYPE.SCENE_ANNOTATION)
        .map((s) => s.id),
    [sources],
  );

  useRegisterDataStream({
    blockingStreams,
    onPlayheadDataReady,
    session,
    source,
    allStreams,
    staleMediaWarningNs: msToNs(temporalPolicy.staleMediaWarningMs),
    staleWarningStreams,
    streamPolicies,
  });
  useRegisterTiles(availableTileTypes);

  return (
    <>
      <FrameTransformsBridge
        fidelityMode={fidelityMode}
        capability={transformRead}
        source={source}
        temporalPolicy={temporalPolicy}
      />
      <PoseTrajectoriesStartupGate
        poseStreams={poseStreams}
        session={session}
        sourceKey={sourceKey}
      />
      <LocationTracksBridge
        locationSources={locationSources}
        session={session}
        sourceKey={sourceKey}
      />
      <SceneUpdateHistoryBridge
        sceneAnnotationStreams={sceneAnnotationStreams}
        session={session}
        sourceKey={sourceKey}
      />
      <NumericSeriesBridge capability={numericSeries} sourceKey={sourceKey} />
      <RawMessageBridge capability={rawRecords} sourceKey={sourceKey} />
    </>
  );
}

function FrameTransformsBridge({
  capability,
  fidelityMode,
  source,
  temporalPolicy,
}: {
  readonly capability: TransformReadAcceleration | null;
  readonly fidelityMode: PlaybackFidelityMode;
  readonly source: ByteSourceDescriptor | null;
  readonly temporalPolicy: TemporalPolicySettings;
}) {
  const setFrameTransforms = useSetFrameTransformsContext();
  const dataStream = useDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const timeNs = usePlaybackTimeNs();
  const dynamicRange = useMemo(
    () =>
      timelineIndex
        ? {
            endTimeNs:
              timelineIndex.endTimeNs + FRAME_TRANSFORM_RANGE_PADDING_NS,
            startTimeNs:
              timelineIndex.startTimeNs > FRAME_TRANSFORM_RANGE_PADDING_NS
                ? timelineIndex.startTimeNs - FRAME_TRANSFORM_RANGE_PADDING_NS
                : 0n,
          }
        : null,
    [timelineIndex],
  );
  const frameTransforms = useFrameTransforms({
    capability,
    dynamicRange,
    policy: {
      boundaryClampNs: msToNs(temporalPolicy.boundaryClampMs),
      maxInterpolationGapNs: msToNs(temporalPolicy.maxInterpolationGapMs),
      resolutionMode: fidelityMode === "smooth" ? "interpolate" : "hold-last",
    },
    sourceKey: source ? episodeSourceAccessKey(source) : null,
    timeNs,
  });

  // This effect publishes the latest transform resolver into episode context and
  // clears it when the bridge unmounts.
  useEffect(() => {
    setFrameTransforms(frameTransforms);
    return () => {
      setFrameTransforms(idleFrameTransformsState());
    };
  }, [frameTransforms, setFrameTransforms]);

  return null;
}

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}
