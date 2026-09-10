import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

export interface PromptableSimilarityIndex {
  key: string;
  /** Set when the index is patches-level: the field its patches come from. */
  patchesField: string | null;
  /** The model the index embeds with, when the run recorded one. */
  model?: string | null;
}

/**
 * The dataset's similarity indexes that accept text prompts, newest first,
 * for surfaces that turn a typed query into a `SortBySimilarity` stage.
 * Brain runs append to `brainMethods` in creation order, so the reversed
 * order is "most recently computed" — the index the user most likely just
 * built for exactly this.
 */
const usePromptableSimilarityKeys = (): PromptableSimilarityIndex[] => {
  const { samples, patches } = useRecoilValue(fos.similarityMethods);
  const brainMethods = useRecoilValue(fos.dataset)?.brainMethods ?? [];
  return useMemo(() => {
    const created = new Map(brainMethods.map((m, i) => [m.key, i]));
    const models = new Map(brainMethods.map((m) => [m.key, m.config.model]));
    return [
      ...samples
        .filter((method) => method.supportsPrompts === true)
        .map(({ key }) => ({
          key,
          patchesField: null,
          model: models.get(key),
        })),
      ...patches
        .filter(([method]) => method.supportsPrompts === true)
        .map(([{ key }, field]) => ({
          key,
          patchesField: field,
          model: models.get(key),
        })),
    ].sort((a, b) => (created.get(b.key) ?? -1) - (created.get(a.key) ?? -1));
  }, [samples, patches, brainMethods]);
};

export default usePromptableSimilarityKeys;
