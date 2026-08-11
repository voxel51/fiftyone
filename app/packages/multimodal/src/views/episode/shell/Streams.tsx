import { useEffect, useMemo } from "react";
import { SCENE_SOURCE_TYPE, type ByteSourceDescriptor } from "../../../ir";
import { streamSyncPoliciesForSceneSources } from "../../../scene-inventory";
import { useSceneInventory } from "../../../scene-inventory/react";
import type {
  EpisodeSession,
  SourceReadBudgetAccount,
  TransformReadAcceleration,
} from "../../../ports";
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
import { useFrameTransforms } from "../spatial/frame-transforms/use-frame-transforms";
import { usePlaybackTimeNs } from "../playback/use-playback-time-ns";
import { useRegisterTiles } from "./use-register-tiles";
import type { TileType } from "../tiles/tile-types";
import { useRegisterDataStream } from "../playback/use-register-data-stream";
import { useFullHistoryStreamsByFeature } from "../playback/full-history-interests";

const FRAME_TRANSFORM_RANGE_PADDING_NS = 1_000_000_000n;
const FRAME_TRANSFORM_BOUNDARY_CLAMP_NS = 50_000_000n;
const EMPTY_STREAMS: readonly string[] = [];

export interface StreamsProps {
  /** Tile kinds supported by the current manifest, capabilities, and build. */
  availableTileTypes: readonly TileType[];
  /** Shared format-neutral episode session owned by the modal renderer. */
  session: EpisodeSession | null;
  /** Called after every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  /** Source-scoped bounded-work account shared by background consumers. */
  budgetAccount?: SourceReadBudgetAccount | null;
  /** Byte source currently feeding the playback shell. */
  source: ByteSourceDescriptor | null;
  /** Episode-wide synchronized-read presentation cadence. */
  timelineSamplingRateHz: number;
}

/**
 * Non-visual child of PlaybackShell. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider`, derives per-stream
 * sync policies from the source types, then wires the episode data layer
 * (single playback stream, per-stream caches, tile registry).
 */
export function Streams({
  availableTileTypes,
  budgetAccount,
  onPlayheadDataReady,
  session,
  source,
  timelineSamplingRateHz,
}: StreamsProps) {
  const sources = useSceneInventory();
  const fullHistoryStreams = useFullHistoryStreamsByFeature();
  const requestedLocationHistoryStreams =
    fullHistoryStreams.get("location") ?? EMPTY_STREAMS;
  const requestedPoseHistoryStreams =
    fullHistoryStreams.get("pose") ?? EMPTY_STREAMS;
  const requestedSceneUpdateHistoryStreams =
    fullHistoryStreams.get("scene-update") ?? EMPTY_STREAMS;
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
  const streamNames = useMemo(
    () => new Map(sources.map((s) => [s.id, s.sourceName])),
    [sources],
  );
  // An image stream's final indexed observation is a real visual boundary.
  // Do not carry its last frame beyond that bound; sparse records, maps, and
  // calibration retain their latest-at-or-before semantics.
  const endBoundedStreams = useMemo(
    () =>
      sources
        .filter((source) => source.type === SCENE_SOURCE_TYPE.IMAGE)
        .map((source) => source.id),
    [sources],
  );
  const staleWarningStreams = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type !== SCENE_SOURCE_TYPE.CAMERA_CALIBRATION &&
            s.type !== SCENE_SOURCE_TYPE.MAP_LAYER,
        )
        .map((s) => s.id),
    [sources],
  );
  // Static maps and calibration metadata remain valid until replaced. Other
  // recorded observations are held but surface their cadence-derived age.
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
      requestedPoseHistoryStreams.filter((stream) =>
        sources.some(
          (source) =>
            source.id === stream && source.type === SCENE_SOURCE_TYPE.POSE,
        ),
      ),
    [requestedPoseHistoryStreams, sources],
  );
  const locationSources = useMemo(
    () => sources.filter((s) => s.type === SCENE_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const locationStreams = useMemo(
    () =>
      requestedLocationHistoryStreams.filter((stream) =>
        locationSources.some((source) => source.id === stream),
      ),
    [locationSources, requestedLocationHistoryStreams],
  );
  const sceneAnnotationStreams = useMemo(
    () =>
      requestedSceneUpdateHistoryStreams.filter((stream) =>
        sources.some(
          (source) =>
            source.id === stream &&
            source.type === SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
        ),
      ),
    [requestedSceneUpdateHistoryStreams, sources],
  );

  useRegisterDataStream({
    blockingStreams,
    endBoundedStreams,
    onPlayheadDataReady,
    session,
    source,
    allStreams,
    staleWarningStreams,
    streamNames,
    streamPolicies,
    timelineSamplingRateHz,
  });
  useRegisterTiles(availableTileTypes);

  return (
    <>
      <FrameTransformsBridge capability={transformRead} source={source} />
      <PoseTrajectoriesStartupGate
        budgetAccount={budgetAccount}
        poseStreams={poseStreams}
        session={session}
        sourceKey={sourceKey}
      />
      <LocationTracksBridge
        budgetAccount={budgetAccount}
        locationSources={locationSources}
        session={session}
        sourceReadProfile={source?.readProfile}
        sourceKey={sourceKey}
        streams={locationStreams}
      />
      <SceneUpdateHistoryBridge
        budgetAccount={budgetAccount}
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
  source,
}: {
  readonly capability: TransformReadAcceleration | null;
  readonly source: ByteSourceDescriptor | null;
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
      boundaryClampNs: FRAME_TRANSFORM_BOUNDARY_CLAMP_NS,
    },
    sourceKey: source ? episodeSourceAccessKey(source) : null,
    timeNs,
  });

  // Publish resolver updates without clearing the context between ordinary
  // state changes. A transient idle publication tears down registered
  // placement scopes, which can feed back into another resolver update.
  useEffect(() => {
    setFrameTransforms(frameTransforms);
  }, [frameTransforms, setFrameTransforms]);

  // Clear the shared resolver only when the bridge actually unmounts.
  useEffect(() => {
    return () => {
      setFrameTransforms(idleFrameTransformsState());
    };
  }, [setFrameTransforms]);

  return null;
}
