import { useEffect, useMemo } from "react";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import {
  streamSyncPoliciesForSceneSources,
  useSceneInventory,
} from "../../../scene-inventory";
import type { ByteSourceDescriptor } from "../../../query/bytes/types";
import { byteSourceAccessKey } from "../../../query/bytes";
import type { EpisodeSession, TransformReadAcceleration } from "../../../ports";
import { createEpisodeTransformReadRuntime } from "../../../runtime";
import {
  idleEpisodeFrameTransformsState,
  useSetEpisodeFrameTransformsContext,
} from "../scene/episode-frame-transforms-context";
import { EpisodeLocationTracksBridge } from "../map/episode-location-tracks-context";
import { EpisodeNumericSeriesBridge } from "../plots/episode-numeric-series-context";
import { EpisodePoseTrajectoriesStartupGate } from "../scene/episode-pose-trajectories-context";
import { EpisodeRawMessageBridge } from "../raw/episode-raw-message-context";
import { EpisodeSceneUpdateHistoryBridge } from "../scene/episode-scene-update-history-context";
import { useEpisodeDataStream } from "../playback/episode-data-stream-context";
import {
  type EpisodePlaybackFidelityMode,
  type EpisodeTemporalPolicySettings,
  useEpisodePlaybackSettings,
  useEpisodeTemporalPolicySettings,
} from "../settings/episode-modal-settings";
import { useEpisodeFrameTransforms } from "../scene/use-episode-frame-transforms";
import { useEpisodePlaybackTimeNs } from "../playback/use-episode-playback-time-ns";
import { useEpisodeTiles } from "../tiles/use-episode-tiles";
import { useRegisterEpisodeDataStream } from "../playback/use-register-episode-data-stream";

const FRAME_TRANSFORM_RANGE_PADDING_NS = 1_000_000_000n;

export interface EpisodeStreamsProps {
  /** Shared format-neutral episode session owned by the modal renderer. */
  session: EpisodeSession | null;
  /** Called after every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  /** Byte source currently feeding the playback shell. */
  source: ByteSourceDescriptor | null;
}

/**
 * Non-visual child of MultiModalPlayback. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider`, derives per-stream
 * sync policies from the source types, then wires the episode data layer
 * (single playback stream, per-stream caches, tile registry).
 */
export function EpisodeStreams({
  onPlayheadDataReady,
  session,
  source,
}: EpisodeStreamsProps) {
  const sources = useSceneInventory();
  const { fidelityMode } = useEpisodePlaybackSettings();
  const { temporalPolicy } = useEpisodeTemporalPolicySettings();
  const numericSeries = session?.numericSeries ?? null;
  const rawRecords = session?.rawRecords ?? null;
  const transformRead = useMemo(
    () => (session ? createEpisodeTransformReadRuntime(session) : null),
    [session],
  );
  const sourceKey = useMemo(
    () => (source ? byteSourceAccessKey(source) : null),
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

  useRegisterEpisodeDataStream({
    blockingStreams,
    onPlayheadDataReady,
    session,
    source,
    allStreams,
    staleMediaWarningNs: msToNs(temporalPolicy.staleMediaWarningMs),
    staleWarningStreams,
    streamPolicies,
  });
  useEpisodeTiles();

  return (
    <>
      <EpisodeFrameTransformsBridge
        fidelityMode={fidelityMode}
        capability={transformRead}
        source={source}
        temporalPolicy={temporalPolicy}
      />
      <EpisodePoseTrajectoriesStartupGate
        poseStreams={poseStreams}
        session={session}
        sourceKey={sourceKey}
      />
      <EpisodeLocationTracksBridge
        locationSources={locationSources}
        session={session}
        sourceKey={sourceKey}
      />
      <EpisodeSceneUpdateHistoryBridge
        sceneAnnotationStreams={sceneAnnotationStreams}
        session={session}
        sourceKey={sourceKey}
      />
      <EpisodeNumericSeriesBridge
        capability={numericSeries}
        sourceKey={sourceKey}
      />
      <EpisodeRawMessageBridge capability={rawRecords} sourceKey={sourceKey} />
    </>
  );
}

function EpisodeFrameTransformsBridge({
  capability,
  fidelityMode,
  source,
  temporalPolicy,
}: {
  readonly capability: TransformReadAcceleration | null;
  readonly fidelityMode: EpisodePlaybackFidelityMode;
  readonly source: ByteSourceDescriptor | null;
  readonly temporalPolicy: EpisodeTemporalPolicySettings;
}) {
  const setFrameTransforms = useSetEpisodeFrameTransformsContext();
  const dataStream = useEpisodeDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const timeNs = useEpisodePlaybackTimeNs();
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
  const frameTransforms = useEpisodeFrameTransforms({
    capability,
    dynamicRange,
    policy: {
      boundaryClampNs: msToNs(temporalPolicy.boundaryClampMs),
      maxInterpolationGapNs: msToNs(temporalPolicy.maxInterpolationGapMs),
      resolutionMode: fidelityMode === "smooth" ? "interpolate" : "hold-last",
    },
    sourceKey: source ? byteSourceAccessKey(source) : null,
    timeNs,
  });

  // This effect publishes the latest transform resolver into episode context and
  // clears it when the bridge unmounts.
  useEffect(() => {
    setFrameTransforms(frameTransforms);
    return () => {
      setFrameTransforms(idleEpisodeFrameTransformsState());
    };
  }, [frameTransforms, setFrameTransforms]);

  return null;
}

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}
