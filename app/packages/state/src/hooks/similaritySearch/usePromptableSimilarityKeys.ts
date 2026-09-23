import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useTextSearchBackends } from "./textSearchBackends";

export interface PromptableSimilarityIndex {
  key: string;
  /** Set when the index is patches-level: the field its patches come from. */
  patchesField: string | null;
  /** The model the index embeds with, when the run recorded one. */
  model?: string | null;
  /** Set when a registered {@link TextSearchBackend} searches this index
   * instead of the server's `SortBySimilarity`: the run's method. */
  backend?: string | null;
  /** When the run was computed. */
  timestamp?: string | null;
}

/**
 * The dataset's similarity indexes that accept text prompts, newest first,
 * for surfaces that turn a typed query into a view. Most become a
 * `SortBySimilarity` stage; those whose method has a registered text search
 * backend are searched by it instead. Brain runs append to `brainMethods` in
 * creation order, so the reversed order is "most recently computed" — the
 * index the user most likely just built for exactly this.
 */
const usePromptableSimilarityKeys = (): PromptableSimilarityIndex[] => {
  const { samples, patches } = useRecoilValue(fos.similarityMethods);
  const brainMethods = useRecoilValue(fos.dataset)?.brainMethods ?? [];
  const backends = useTextSearchBackends();
  return useMemo(() => {
    const created = new Map(brainMethods.map((m, i) => [m.key, i]));
    const models = new Map(brainMethods.map((m) => [m.key, m.config.model]));
    const timestamps = new Map(brainMethods.map((m) => [m.key, m.timestamp]));
    return [
      ...samples
        .filter((method) => method.supportsPrompts === true)
        .map(({ key }) => ({
          key,
          patchesField: null,
          model: models.get(key),
          timestamp: timestamps.get(key),
        })),
      ...patches
        .filter(([method]) => method.supportsPrompts === true)
        .map(([{ key }, field]) => ({
          key,
          patchesField: field,
          model: models.get(key),
          timestamp: timestamps.get(key),
        })),
      // `similarityMethods` leaves these out: `SortBySimilarity` cannot run
      // on them, so only a registered backend makes them searchable
      ...brainMethods
        .filter(
          ({ config }) =>
            config.supportsPrompts === true && backends.has(config.method),
        )
        .map(({ key, config, timestamp }) => ({
          key,
          patchesField: null,
          model: config.model,
          backend: config.method,
          timestamp,
        })),
    ].sort((a, b) => (created.get(b.key) ?? -1) - (created.get(a.key) ?? -1));
  }, [samples, patches, brainMethods, backends]);
};

export default usePromptableSimilarityKeys;
