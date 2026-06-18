import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapStreamPolicies } from "./use-mcap-scene-inventory";
import { useMcapTiles } from "./use-mcap-tiles";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";
import { useStableMcapSource } from "./use-stable-mcap-source";

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
}

/**
 * Non-visual child of MultiModalPlayback. Reads the scene inventory
 * from the surrounding `SceneInventoryProvider` and per-topic policies
 * from the filename-driven hook, then wires the MCAP data layer
 * (single playback stream, per-topic caches, tile registry).
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
    [sources],
  );

  useRegisterMcapDataStream({ client, source, allTopics, streamPolicies });
  useMcapTiles({ presentTypes });

  return null;
}
