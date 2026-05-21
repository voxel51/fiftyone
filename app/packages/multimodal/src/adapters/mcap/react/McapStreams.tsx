import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import type { McapStreamSyncPolicies } from "../types";
import { useMcapDataStream } from "./use-mcap-data-stream";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapTiles } from "./use-mcap-tiles";
import { useStableMcapSource } from "./use-stable-mcap-source";

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
  streamPolicies?: McapStreamSyncPolicies;
}

/**
 * Rendered as a non-visual child of MultiModalPlayback. Reads the
 * scene inventory (no hardcoded topic lists) and wires the two MCAP
 * setup hooks inside the playback + tiling providers.
 *
 * useMcapDataStream  — single PlaybackStream, per-topic caches, batch fetch.
 * useMcapTiles       — one tile registration per unique type present.
 */
export function McapStreams({ ctx, streamPolicies = {} }: McapStreamsProps) {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const sources = useSceneInventory();

  const allTopics = useMemo(() => sources.map((s) => s.id), [sources]);
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources]
  );

  useMcapDataStream({ client, source, allTopics, streamPolicies });
  useMcapTiles({ presentTypes });

  return null;
}
