import type { SampleRendererProps } from "@fiftyone/plugins";
import { useEffect, useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { MCAP_SOURCE_TYPE, mcapStreamPolicies } from "../scene-sources";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import {
  idleMcapFrameTransformsState,
  useSetMcapFrameTransformsContext,
} from "./mcap-frame-transforms-context";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { markMcapLatencyEvent } from "./mcap-latency-debug";
import {
  type McapTemporalPolicySettings,
  useMcapModalSettings,
} from "./mcap-modal-settings";
import { useMcapFrameTransforms } from "./use-mcap-frame-transforms";
import { useMcapPlaybackTimeNs } from "./use-mcap-playback-time-ns";
import { useMcapTiles } from "./use-mcap-tiles";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";
import { useStableMcapSource } from "./use-stable-mcap-source";

const FRAME_TRANSFORM_RANGE_PADDING_NS = 1_000_000_000n;

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
  /** Shared adapter resource client owned by the modal renderer. */
  client: McapResourceClient;
}

/**
 * Non-visual child of MultiModalPlayback. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider`, derives per-topic
 * sync policies from the source types, then wires the MCAP data layer
 * (single playback stream, per-topic caches, tile registry).
 */
export function McapStreams({ ctx, client }: McapStreamsProps) {
  const source = useStableMcapSource(ctx);
  const sources = useSceneInventory();
  const { temporalPolicy } = useMcapModalSettings();

  const streamPolicies = useMemo(() => mcapStreamPolicies(sources), [sources]);
  const allTopics = useMemo(() => sources.map((s) => s.id), [sources]);
  const pointCloudTopics = useMemo(
    () =>
      sources
        .filter((s) => s.type === MCAP_SOURCE_TYPE.POINT_CLOUD)
        .map((s) => s.id),
    [sources],
  );
  const blockingTopics = useMemo(
    () =>
      sources
        .filter(
          (s) =>
            s.type !== MCAP_SOURCE_TYPE.IMAGE_ANNOTATION &&
            s.type !== MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
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

  useRegisterMcapDataStream({
    blockingTopics,
    client,
    source,
    allTopics,
    pointCloudTopics,
    staleMediaWarningNs: msToNs(temporalPolicy.staleMediaWarningMs),
    streamPolicies,
  });
  useMcapTiles({ presentTypes });

  return (
    <McapFrameTransformsBridge
      client={client}
      source={source}
      temporalPolicy={temporalPolicy}
    />
  );
}

function McapFrameTransformsBridge({
  client,
  source,
  temporalPolicy,
}: {
  readonly client: McapResourceClient;
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
