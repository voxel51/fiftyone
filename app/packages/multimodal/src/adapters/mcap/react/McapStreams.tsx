import type { SampleRendererProps } from "@fiftyone/plugins";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { usePlaybackStore } from "../../../../../playback/src/lib/playback/playback-store-context";
import type { McapStreamSyncPolicies } from "../types";
import { mcapDataStreamAtom } from "./mcap-atoms";
import { useMcapDataStream } from "./use-mcap-data-stream";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapTiles } from "./use-mcap-tiles";
import { useStableMcapSource } from "./use-stable-mcap-source";

export interface McapTopicSpec {
  readonly topic: string;
  readonly label: string;
}

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
  cameraTopics: readonly McapTopicSpec[];
  lidarTopic?: McapTopicSpec;
  streamPolicies?: McapStreamSyncPolicies;
}

/**
 * Rendered as a non-visual child of MultiModalPlayback. Calls the two MCAP
 * setup hooks inside the playback + tiling providers and renders nothing.
 *
 * useMcapDataStream  — single PlaybackStream, per-topic caches, batch fetch.
 * useMcapTiles       — tile registry entries + initial tile-source bindings.
 */
export function McapStreams({
  ctx,
  cameraTopics,
  lidarTopic,
  streamPolicies = {},
}: McapStreamsProps) {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const store = usePlaybackStore();

  const allTopics = useMemo(
    () => [
      ...cameraTopics.map((c) => c.topic),
      ...(lidarTopic ? [lidarTopic.topic] : []),
    ],
    [cameraTopics, lidarTopic]
  );

  useMcapDataStream({ client, source, allTopics, streamPolicies });

  const dataStream = useAtomValue(mcapDataStreamAtom, { store });

  useMcapTiles({
    cameraTopics,
    lidarTopic,
    isReady: dataStream !== null,
  });

  return null;
}
