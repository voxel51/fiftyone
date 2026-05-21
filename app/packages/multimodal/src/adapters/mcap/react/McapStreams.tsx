import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { useMcapDataStream } from "./use-mcap-data-stream";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapStreamPolicies } from "./use-mcap-scene-inventory";
import { useMcapTiles } from "./use-mcap-tiles";
import { useStableMcapSource } from "./use-stable-mcap-source";

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
}

/**
 * Rendered as a non-visual child of MultiModalPlayback. Reads the
 * scene inventory + sync policies from the MCAP metadata hooks and
 * wires the two MCAP setup hooks inside the playback + tiling
 * providers.
 *
 * useMcapDataStream  — single PlaybackStream, per-topic caches, batch fetch.
 * useMcapTiles       — one tile registration per unique type present.
 */
export function McapStreams({ ctx }: McapStreamsProps) {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const sources = useSceneInventory();
  const fileName = source?.sourceId.split("/").pop() ?? "";
  const streamPolicies = useMcapStreamPolicies(fileName);

  const allTopics = useMemo(() => sources.map((s) => s.id), [sources]);
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources]
  );

  useMcapDataStream({ client, source, allTopics, streamPolicies });
  useMcapTiles({ presentTypes });

  return null;
}
