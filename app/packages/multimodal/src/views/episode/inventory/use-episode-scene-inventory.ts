import { useMemo } from "react";
import type { StreamDescriptor } from "../../../ir";
import type { LoadStatus } from "../../../runtime";
import {
  sceneSourcesFromStreamDescriptors,
  type SceneSource,
} from "../../../scene-inventory";
import {
  useEpisodeStreams,
  type UseEpisodeStreamsOptions,
} from "./use-episode-streams";

export type EpisodeSceneInventoryStatus = LoadStatus;

export interface EpisodeSceneInventoryState {
  readonly error: string | null;
  readonly status: EpisodeSceneInventoryStatus;
  readonly sources: readonly SceneSource[];
  readonly streams: readonly StreamDescriptor[];
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
    () => sceneSourcesFromStreamDescriptors(streams),
    [streams],
  );

  return useMemo(
    () => ({ error, sources, status, streams, streamCount: streams.length }),
    [error, sources, status, streams],
  );
}
