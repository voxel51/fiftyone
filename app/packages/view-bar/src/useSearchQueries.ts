/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The prompts the selected index can answer without encoding anything new,
 * as its text search extension reports them, and whether it can search
 * anything else. Read again whenever `readCount` changes: an extension adds
 * queries as a job that finishes later, so each time the field opens is when
 * new ones can surface.
 */

import type {
  PromptableSimilarityIndex,
  TextSearchAddQueriesProps,
  TextSearchIndex,
  TextSearchQueries,
} from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

export interface SearchQueries extends TextSearchQueries {
  /** No answer yet: nothing can be searched until one arrives. */
  loading: boolean;
  index: TextSearchIndex;
  AddQueries?: React.ComponentType<TextSearchAddQueriesProps>;
}

/** Null when the index's search takes any prompt and suggests none. */
export const useSearchQueries = (
  index: PromptableSimilarityIndex | undefined,
  readCount: number,
): SearchQueries | null => {
  const datasetName = fos.useCurrentDatasetName();
  const extensions = fos.useTextSearchExtensions();
  const extension = index?.extension
    ? extensions.get(index.extension)
    : undefined;
  const brainKey = index?.key ?? null;
  const runTimestamp = index?.timestamp ?? null;

  // Tagged with the index it answers, so another index's queries never show
  // while this one's are loading
  const [resolved, setResolved] = useState<{
    brainKey: string;
    runTimestamp: string | null;
    answer: TextSearchQueries;
  } | null>(null);

  useEffect(() => {
    if (!extension?.queries || !datasetName || !brainKey) return undefined;
    let live = true;
    extension
      .queries({ datasetName, brainKey, runTimestamp })
      .then((answer) => {
        if (live) setResolved({ brainKey, runTimestamp, answer });
      })
      .catch((error: unknown) => {
        // Unknown means nothing is known to be searchable
        console.error("Encoded search queries unavailable:", error);
        if (live) {
          setResolved({
            brainKey,
            runTimestamp,
            answer: { queries: [], freeText: false },
          });
        }
      });
    return () => {
      live = false;
    };
  }, [extension, datasetName, brainKey, runTimestamp, readCount]);

  const AddQueries = extension?.AddQueries;
  const current =
    resolved?.brainKey === brainKey && resolved?.runTimestamp === runTimestamp
      ? resolved.answer
      : null;

  return useMemo(() => {
    if (!extension?.queries || !datasetName || !brainKey) return null;
    return {
      queries: current?.queries ?? [],
      freeText: current?.freeText ?? false,
      loading: !current,
      index: { datasetName, brainKey, runTimestamp },
      AddQueries,
    };
  }, [extension, datasetName, brainKey, runTimestamp, current, AddQueries]);
};
