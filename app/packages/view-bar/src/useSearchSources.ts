/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What the selected index's matches can come from, for the search settings
 * to narrow a search to: today, what the index's text search extension
 * reports, such as a multimodal index's streams. Asked only once `wanted`,
 * since finding them can cost the extension a server request.
 */

import type { PromptableSimilarityIndex, SearchSources } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useEffect, useState } from "react";

export const useSearchSources = (
  index: PromptableSimilarityIndex | undefined,
  wanted: boolean,
): SearchSources | null => {
  const datasetName = fos.useCurrentDatasetName();
  const extensions = fos.useTextSearchExtensions();
  const extension = index?.extension
    ? extensions.get(index.extension)
    : undefined;
  const brainKey = index?.key ?? null;
  const runTimestamp = index?.timestamp ?? null;

  // Tagged with the index it answers, so another index's sources never show
  // while this one's are loading
  const [resolved, setResolved] = useState<{
    brainKey: string;
    sources: SearchSources | null;
  } | null>(null);

  useEffect(() => {
    if (!wanted || !extension?.sources || !datasetName || !brainKey) {
      return undefined;
    }
    let live = true;
    extension
      .sources({ datasetName, brainKey, runTimestamp })
      .then((sources) => {
        if (live) setResolved({ brainKey, sources });
      })
      .catch((error: unknown) => {
        // Without them the search still runs, over every source
        console.error("Search sources unavailable:", error);
        if (live) setResolved({ brainKey, sources: null });
      });
    return () => {
      live = false;
    };
  }, [wanted, extension, datasetName, brainKey, runTimestamp]);

  if (!extension?.sources || resolved?.brainKey !== brainKey) return null;
  const sources = resolved.sources;
  // One source leaves nothing to choose between
  return sources && sources.values.length > 1 ? sources : null;
};
