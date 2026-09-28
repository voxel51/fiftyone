/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The group slices each similarity index covers on a grouped dataset, for
 * the search settings: the slices a search can be narrowed to, and the note
 * beside each index's name. Asked of the server once per index for the
 * session.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";

const answers = new Map<string, Promise<string[]>>();

const answerKey = (datasetName: string, index: PromptableSimilarityIndex) =>
  JSON.stringify([datasetName, index.key, index.timestamp ?? null]);

const fetchIndexSlices = async (
  datasetName: string,
  brainKey: string,
): Promise<string[]> => {
  const response = await getFetchFunction()<
    { dataset: string; brainKey: string },
    { slices?: unknown }
  >("POST", "/similarity-index-slices", { dataset: datasetName, brainKey });
  return Array.isArray(response?.slices)
    ? response.slices.filter(
        (slice): slice is string => typeof slice === "string",
      )
    : [];
};

const indexSlices = (
  datasetName: string,
  index: PromptableSimilarityIndex,
): Promise<string[]> => {
  const key = answerKey(datasetName, index);
  const known = answers.get(key);
  if (known) return known;

  const answer = fetchIndexSlices(datasetName, index.key);
  // A failure is not remembered, so the next ask retries
  answer.catch(() => {
    if (answers.get(key) === answer) answers.delete(key);
  });
  answers.set(key, answer);
  return answer;
};

/** Forgets every answer. For tests. */
export const clearIndexSlices = (): void => answers.clear();

/**
 * Whether slices mean anything for `index`: only the server's
 * `SortBySimilarity` searches across slices, and only over samples, so a
 * provider's index or a patches index has none.
 */
export const searchesSlices = (index: PromptableSimilarityIndex): boolean =>
  !index.provider && !index.patchesField;

/**
 * The slices each of `indexes` covers, by brain key, once `wanted` on a
 * grouped dataset. An index is absent until its answer arrives, and when it
 * has no slices to speak of.
 */
export const useIndexSlices = (
  indexes: readonly PromptableSimilarityIndex[],
  wanted: boolean,
): ReadonlyMap<string, readonly string[]> => {
  const datasetName = fos.useCurrentDatasetName();
  const grouped = fos.useIsGroupDataset();
  const asked = useMemo(
    () => (wanted && grouped ? indexes.filter(searchesSlices) : []),
    [wanted, grouped, indexes],
  );
  const [slices, setSlices] = useState<ReadonlyMap<string, readonly string[]>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!datasetName || asked.length === 0) return undefined;
    let live = true;
    for (const index of asked) {
      indexSlices(datasetName, index).then(
        (answer) => {
          if (!live) return;
          setSlices((current) => new Map(current).set(index.key, answer));
        },
        (error: unknown) => {
          // Without them the search still runs, over every slice
          console.error("Index slices unavailable:", error);
        },
      );
    }
    return () => {
      live = false;
    };
  }, [datasetName, asked]);

  return useMemo(
    () =>
      new Map(
        asked.flatMap((index) => {
          const answer = slices.get(index.key);
          return answer?.length ? [[index.key, answer] as const] : [];
        }),
      ),
    [asked, slices],
  );
};
