import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useTextSearchExtensions } from "./textSearchExtensions";

export interface PromptableSimilarityIndex {
  key: string;
  /** Set when the index is patches-level: the field its patches come from. */
  patchesField: string | null;
  /** The model the index embeds with, when the run recorded one. */
  model?: string | null;
  /** Set when a registered {@link TextSearchExtension} searches this index
   * client-side instead of the server's `SortBySimilarity`: the run's
   * method. */
  extension?: string | null;
  /** When the run was computed. */
  timestamp?: string | null;
}

/**
 * The dataset's similarity indexes that accept text prompts, newest first,
 * for surfaces that turn a typed query into a search. Most become a
 * `SortBySimilarity` stage; those whose method has a registered text search
 * extension are searched by it instead. Brain runs append to `brainMethods` in
 * creation order, so the reversed order is "most recently computed" — the
 * index the user most likely just built for exactly this.
 */
const usePromptableSimilarityKeys = (): PromptableSimilarityIndex[] => {
  const { samples, patches } = useRecoilValue(fos.similarityMethods);
  const brainMethods = useRecoilValue(fos.dataset)?.brainMethods ?? [];
  const extensions = useTextSearchExtensions();
  return useMemo(() => {
    const created = new Map(brainMethods.map((m, i) => [m.key, i]));
    const models = new Map(brainMethods.map((m) => [m.key, m.config.model]));
    const timestamps = new Map(brainMethods.map((m) => [m.key, m.timestamp]));
    // A registered extension searches its method's indexes even where the
    // server could sort them, so each such key is offered once, as the
    // extension's — a server copy listed beside it would win the lookup by
    // key and send the query to `SortBySimilarity` instead
    const searchedByExtension = brainMethods
      .filter(
        ({ config }) =>
          (config.type === "similarity" ||
            config.cls.toLowerCase().includes("similarity")) &&
          config.supportsPrompts === true &&
          extensions.has(config.method),
      )
      .map(({ key, config, timestamp }) => ({
        key,
        patchesField: config.patchesField ?? null,
        model: config.model,
        extension: config.method,
        timestamp,
      }));
    const extensionKeys = new Set(searchedByExtension.map(({ key }) => key));
    return [
      ...samples
        .filter(
          (method) =>
            method.supportsPrompts === true && !extensionKeys.has(method.key),
        )
        .map(({ key }) => ({
          key,
          patchesField: null,
          model: models.get(key),
          timestamp: timestamps.get(key),
        })),
      ...patches
        .filter(
          ([method]) =>
            method.supportsPrompts === true && !extensionKeys.has(method.key),
        )
        .map(([{ key }, field]) => ({
          key,
          patchesField: field,
          model: models.get(key),
          timestamp: timestamps.get(key),
        })),
      ...searchedByExtension,
    ].sort((a, b) => (created.get(b.key) ?? -1) - (created.get(a.key) ?? -1));
  }, [samples, patches, brainMethods, extensions]);
};

export default usePromptableSimilarityKeys;
