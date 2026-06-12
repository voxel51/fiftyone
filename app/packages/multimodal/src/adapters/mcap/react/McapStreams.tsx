import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { mcapStreamPolicies } from "../scene-sources";
import type { McapResourceClient } from "../types";
import { useMcapTiles } from "./use-mcap-tiles";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";
import { useStableMcapSource } from "./use-stable-mcap-source";

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

  const streamPolicies = useMemo(() => mcapStreamPolicies(sources), [sources]);
  const allTopics = useMemo(() => sources.map((s) => s.id), [sources]);
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources]
  );

  useRegisterMcapDataStream({ client, source, allTopics, streamPolicies });
  useMcapTiles({ presentTypes });

  return null;
}
