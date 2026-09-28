/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What the selected index's matches can come from, for the search settings
 * to narrow a search to: what the index's text search provider reports, such
 * as a multimodal index's streams, or on a grouped dataset the slices an
 * index the server searches covers. Asked only once `wanted`, since finding
 * them costs a server request.
 */

import type { PromptableSimilarityIndex, SearchSources } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";

import { useIndexSlices } from "./useIndexSlices";

export const useSearchSources = (
  index: PromptableSimilarityIndex | undefined,
  wanted: boolean,
): SearchSources | null => {
  const datasetName = fos.useCurrentDatasetName();
  const providers = fos.useTextSearchProviders();
  const provider = index?.provider ? providers.get(index.provider) : undefined;
  const brainKey = index?.key ?? null;
  const runTimestamp = index?.timestamp ?? null;

  const sliceIndexes = useMemo(
    () => (index && !index.provider ? [index] : []),
    [index],
  );
  const slices = useIndexSlices(sliceIndexes, wanted).get(brainKey ?? "");
  const sliceSources = useMemo(
    () => (slices ? { label: "Slices", values: [...slices] } : null),
    [slices],
  );

  // Tagged with the index it answers, so another index's sources never show
  // while this one's are loading
  const [resolved, setResolved] = useState<{
    brainKey: string;
    sources: SearchSources | null;
  } | null>(null);

  useEffect(() => {
    if (!wanted || !provider?.sources || !datasetName || !brainKey) {
      return undefined;
    }
    let live = true;
    provider
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
  }, [wanted, provider, datasetName, brainKey, runTimestamp]);

  let sources: SearchSources | null;
  if (!index?.provider) {
    sources = sliceSources;
  } else if (!provider?.sources || resolved?.brainKey !== brainKey) {
    return null;
  } else {
    sources = resolved.sources;
  }
  // One source leaves nothing to choose between
  return sources && sources.values.length > 1 ? sources : null;
};
