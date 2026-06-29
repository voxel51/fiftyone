import { useMemo } from "react";
import type { LoadStatus } from "../../../load-status";
import type { SceneSource } from "../../../scene-inventory";
import { mcapSceneSources } from "../scene-sources";
import { useMcapTopics, type UseMcapTopicsOptions } from "./use-mcap-topics";

export type McapSceneInventoryStatus = LoadStatus;

export interface McapSceneInventoryState {
  readonly error: string | null;
  readonly status: McapSceneInventoryStatus;
  readonly sources: readonly SceneSource[];
  readonly topicCount: number;
}

/**
 * Loads the MCAP topic inventory for a source and derives the scene
 * inventory from it — the discoverable cameras/lidars/annotation
 * streams actually present in the file, whatever produced it.
 */
export function useMcapSceneInventory(
  options: UseMcapTopicsOptions,
): McapSceneInventoryState {
  const { status, error, topics } = useMcapTopics(options);
  const sources = useMemo(() => mcapSceneSources(topics), [topics]);

  return useMemo(
    () => ({ error, sources, status, topicCount: topics.length }),
    [error, sources, status, topics.length],
  );
}
