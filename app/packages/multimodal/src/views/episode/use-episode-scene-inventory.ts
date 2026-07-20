import { useMemo } from "react";
import type { LoadStatus } from "../../runtime";
import {
  sceneSourcesFromStreamInventory,
  type SceneSource,
} from "../../scene-inventory";
import type { StreamInventory } from "../../schemas/v1";
import {
  useEpisodeStreams,
  type UseEpisodeStreamsOptions,
} from "./use-episode-streams";

export type EpisodeSceneInventoryStatus = LoadStatus;

export interface EpisodeSceneInventoryState {
  readonly error: string | null;
  readonly status: EpisodeSceneInventoryStatus;
  readonly sources: readonly SceneSource[];
  readonly streams: readonly StreamInventory[];
  readonly streamCount: number;
}

/**
 * Loads the episode stream inventory for a source and derives the scene
 * inventory from it — the discoverable cameras/lidars/annotation
 * streams actually present in the file, whatever produced it.
 */
export function useEpisodeSceneInventory(
  options: UseEpisodeStreamsOptions,
): EpisodeSceneInventoryState {
  const { status, error, streams } = useEpisodeStreams(options);
  const sources = useMemo(
    () => sceneSourcesFromStreamInventory(streams),
    [streams],
  );

  return useMemo(
    () => ({ error, sources, status, streams, streamCount: streams.length }),
    [error, sources, status, streams],
  );
}
