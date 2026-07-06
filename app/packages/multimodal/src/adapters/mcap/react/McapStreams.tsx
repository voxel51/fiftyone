import { useEffect, useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { MCAP_SOURCE_TYPE, mcapStreamPolicies } from "../scene-sources";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import {
  idleMcapFrameTransformsState,
  useSetMcapFrameTransformsContext,
} from "./mcap-frame-transforms-context";
import { McapNumericSeriesBridge } from "./mcap-numeric-series-context";
import { McapPoseTrajectoriesStartupGate } from "./mcap-pose-trajectories-context";
import { McapRawMessageBridge } from "./mcap-raw-message-context";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  type McapPlaybackFidelityMode,
  type McapTemporalPolicySettings,
  useMcapModalSettings,
} from "./mcap-modal-settings";
import { useMcapFrameTransforms } from "./use-mcap-frame-transforms";
import { useMcapPlaybackTimeNs } from "./use-mcap-playback-time-ns";
import { useMcapTiles } from "./use-mcap-tiles";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";

const FRAME_TRANSFORM_RANGE_PADDING_NS = 1_000_000_000n;

export interface McapStreamsProps {
  /** Shared adapter resource client owned by the modal renderer. */
  client: McapResourceClient;
  /** Byte source currently feeding the playback shell. */
  source: ByteSourceDescriptor | null;
}

/**
 * Non-visual child of MultiModalPlayback. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider`, derives per-topic
 * sync policies from the source types, then wires the MCAP data layer
 * (single playback stream, per-topic caches, tile registry).
 */
export function McapStreams({ client, source }: McapStreamsProps) {
  const sources = useSceneInventory();
  const { fidelityMode, temporalPolicy } = useMcapModalSettings();

  const streamPolicies = useMemo(() => mcapStreamPolicies(sources), [sources]);
  const allTopics = useMemo(() => sources.map((s) => s.id), [sources]);
  const pointCloudTopics = useMemo(
    () =>
      sources
        .filter((s) => s.type === MCAP_SOURCE_TYPE.POINT_CLOUD)
        .map((s) => s.id),
    [sources],
  );
  const staleWarningTopics = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type === MCAP_SOURCE_TYPE.IMAGE ||
            s.type === MCAP_SOURCE_TYPE.POINT_CLOUD,
        )
        .map((s) => s.id),
    [sources],
  );
  // Map layers are overlays like annotations: playback must not stall on a
  // one-shot multi-megabyte /map fetch, and a static map is *supposed* to be
  // older than the playhead, so it never earns a stale-media warning.
  const blockingTopics = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type !== MCAP_SOURCE_TYPE.IMAGE_ANNOTATION &&
            s.type !== MCAP_SOURCE_TYPE.SCENE_ANNOTATION &&
            s.type !== MCAP_SOURCE_TYPE.MAP_LAYER &&
            s.type !== MCAP_SOURCE_TYPE.CAMERA_CALIBRATION &&
            s.type !== MCAP_SOURCE_TYPE.POSE &&
            s.type !== MCAP_SOURCE_TYPE.LOCATION,
        )
        .map((s) => s.id),
    [sources],
  );
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources],
  );
  useEffect(() => {
    markMcapLatencyEvent(
      "playback shell mounted",
      {
        blockingTopics: blockingTopics.length,
        pointCloudTopics: pointCloudTopics.length,
        topics: allTopics.length,
      },
      { onceKey: "playback-shell-mounted" },
    );
  }, [allTopics.length, blockingTopics.length, pointCloudTopics.length]);

  const poseTopics = useMemo(
    () =>
      sources.filter((s) => s.type === MCAP_SOURCE_TYPE.POSE).map((s) => s.id),
    [sources],
  );

  useRegisterMcapDataStream({
    blockingTopics,
    client,
    source,
    allTopics,
    pointCloudTopics,
    staleMediaWarningNs: msToNs(temporalPolicy.staleMediaWarningMs),
    staleWarningTopics,
    streamPolicies,
  });
  useMcapTiles({ presentTypes });

  return (
    <>
      <McapFrameTransformsBridge
        client={client}
        fidelityMode={fidelityMode}
        source={source}
        temporalPolicy={temporalPolicy}
      />
      <McapPoseTrajectoriesStartupGate
        client={client}
        poseTopics={poseTopics}
        source={source}
      />
      <McapNumericSeriesBridge client={client} source={source} />
      <McapRawMessageBridge client={client} source={source} />
    </>
  );
}

function McapFrameTransformsBridge({
  client,
  fidelityMode,
  source,
  temporalPolicy,
}: {
  readonly client: McapResourceClient;
  readonly fidelityMode: McapPlaybackFidelityMode;
  readonly source: ByteSourceDescriptor | null;
  readonly temporalPolicy: McapTemporalPolicySettings;
}) {
  const setFrameTransforms = useSetMcapFrameTransformsContext();
  const dataStream = useMcapDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const timeNs = useMcapPlaybackTimeNs();
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
  const frameTransforms = useMcapFrameTransforms({
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    client,
    dynamicRange,
    policy: {
      boundaryClampNs: msToNs(temporalPolicy.boundaryClampMs),
      maxInterpolationGapNs: msToNs(temporalPolicy.maxInterpolationGapMs),
      resolutionMode: fidelityMode === "smooth" ? "interpolate" : "hold-last",
    },
    source,
    timeNs,
  });

  // This effect publishes the latest transform resolver into MCAP context and
  // clears it when the bridge unmounts.
  useEffect(() => {
    setFrameTransforms(frameTransforms);
    return () => {
      setFrameTransforms(idleMcapFrameTransformsState());
    };
  }, [frameTransforms, setFrameTransforms]);

  return null;
}

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}
