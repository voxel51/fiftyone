import { useMemo } from "react";
import type { StreamDescriptor } from "../../../ir/index";
import type { LoadStatus } from "../../../runtime/index";
import type { SceneSource } from "../../../scene-inventory/index";
import { sceneSourcesFromStreamDescriptors } from "../../../stream-selection/scene-sources";
import { useStreams, type UseStreamsOptions } from "./use-streams";

export type SceneInventoryStatus = LoadStatus;

export interface SceneInventoryState {
  readonly error: string | null;
  readonly status: SceneInventoryStatus;
  readonly sources: readonly SceneSource[];
  readonly streams: readonly StreamDescriptor[];
  readonly streamCount: number;
}

/**
 * Loads the episode stream inventory for a source and derives the scene
 * inventory from it — the discoverable cameras/lidars/annotation
 * streams actually present in the file, whatever produced it.
 */
export function useSceneInventoryState(
  options: UseStreamsOptions,
): SceneInventoryState {
  const { status, error, streams } = useStreams(options);
  const sources = useMemo(
    () => sceneSourcesFromStreamDescriptors(streams),
    [streams],
  );

  return useMemo(
    () => ({ error, sources, status, streams, streamCount: streams.length }),
    [error, sources, status, streams],
  );
}
