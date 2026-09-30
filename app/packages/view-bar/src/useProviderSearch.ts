/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Text search for an index a registered text search provider searches
 * client-side, which the server cannot sort by: the provider runs it and
 * the result is published to the extended selection, which narrows the grid
 * without changing the view.
 */

import type {
  PromptableSimilarityIndex,
  SearchSources,
  TextSearchIndex,
} from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HistorySuggestions } from "./HistorySuggestions";
import type { SearchStrategy } from "./searchStrategy";
import { viewFingerprint } from "./state";

/**
 * `run` does nothing for an index no registered provider searches. Such an
 * index is only offered while its provider is registered, and needs neither
 * the operator nor `SortBySimilarity`, so this search is always available.
 */
export interface ProviderSearch extends SearchStrategy {
  /** Drops the search in flight: nothing it returns is published. */
  cancel: () => void;
}

export const useProviderSearch = ({
  onRun,
  selectedIndex,
  searchIndex,
  sourcesWanted,
}: {
  /** Called when a search actually runs. */
  onRun: (index: PromptableSimilarityIndex, query: string) => void;
  selectedIndex: PromptableSimilarityIndex | undefined;
  /** `selectedIndex`, as a provider is asked about it. */
  searchIndex: TextSearchIndex | null;
  /** Finding sources can cost the provider a server request, so it waits
   * for this. */
  sourcesWanted: boolean;
}): ProviderSearch => {
  const datasetId = fos.useCurrentDatasetId();
  const datasetName = fos.useCurrentDatasetName();
  const view = fos.useView();
  const filters = fos.useFilters();
  const extended = fos.useExtendedStages();
  const providers = fos.useTextSearchProviders();
  const publishExtendedSelection = fos.usePublishExtendedSelection();
  const setViewChangePending = fos.useSetViewChangePending();
  const notify = fos.useNotification();

  // Only the newest search may publish; null while none is in flight
  const searchSeq = useRef(0);
  const inFlight = useRef<number | null>(null);
  // Tells the running search to stop early. A provider may finish anyway,
  // so `searchSeq`, not the signal, decides what publishes
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    searchSeq.current += 1;
    controller.current?.abort();
    controller.current = null;
    if (inFlight.current !== null) {
      inFlight.current = null;
      setViewChangePending(false);
    }
  }, [setViewChangePending]);

  // A search still running when its host goes away (the view bar is keyed
  // by dataset) must not publish into the next one, nor leave its pending
  // treatment on
  useEffect(() => cancel, [cancel]);

  // A search answers the view it was typed over. Once the view changes —
  // stages applied, an operator, navigation — its result would narrow a view
  // nobody searched
  const viewFp = useMemo(() => viewFingerprint(view), [view]);
  useEffect(() => cancel(), [viewFp, cancel]);

  const run = useCallback(
    (
      index: PromptableSimilarityIndex,
      query: string,
      k: number,
      sources: string[] | null,
    ) => {
      const provider = index.provider
        ? providers.get(index.provider)
        : undefined;
      if (!provider || !datasetId || !datasetName) return;

      onRun(index, query);

      controller.current?.abort();
      const { signal } = (controller.current = new AbortController());
      const seq = ++searchSeq.current;
      inFlight.current = seq;
      // The in-progress treatment the field shows for any search. No view
      // change follows this one, so it is released below, not by the router
      setViewChangePending(true);
      // Through the executor, so a provider that throws before returning
      // its promise still reaches the failure handling below
      new Promise<fos.TextSearchResult | null>((resolve) =>
        resolve(
          provider.search({
            datasetId,
            datasetName,
            brainKey: index.key,
            runTimestamp: index.timestamp ?? null,
            query,
            k,
            view,
            filters,
            extended,
            sources,
            signal,
          }),
        ),
      )
        .then((result) => {
          if (seq !== searchSeq.current || !result) return;
          publishExtendedSelection(result.stage, result.decorate);
        })
        .catch((error: unknown) => {
          if (seq !== searchSeq.current) return;
          console.error("Text search failed:", error);
          notify({
            key: "view-bar-text-search-failed",
            msg: error instanceof Error ? error.message : String(error),
            variant: "error",
            // A provider's refusal explains what to do instead, which the
            // default few seconds are too short to read
            autoHideDuration: 10000,
          });
        })
        .finally(() => {
          // A newer search owns the pending treatment now
          if (seq !== searchSeq.current) return;
          inFlight.current = null;
          setViewChangePending(false);
        });
    },
    [
      providers,
      datasetId,
      datasetName,
      view,
      filters,
      extended,
      publishExtendedSelection,
      setViewChangePending,
      notify,
      onRun,
    ],
  );

  const selectedProvider = selectedIndex?.provider
    ? providers.get(selectedIndex.provider)
    : undefined;
  // Tagged with the index it answers, so another index's sources never show
  // while this one's are loading
  const [resolved, setResolved] = useState<{
    brainKey: string;
    sources: SearchSources | null;
  } | null>(null);
  useEffect(() => {
    if (!sourcesWanted || !selectedProvider?.sources || !searchIndex) {
      return undefined;
    }
    let live = true;
    const { brainKey } = searchIndex;
    selectedProvider
      .sources(searchIndex)
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
  }, [sourcesWanted, selectedProvider, searchIndex]);

  return {
    available: true,
    enabled: true,
    run,
    cancel,
    sources:
      selectedProvider?.sources &&
      resolved &&
      resolved.brainKey === searchIndex?.brainKey
        ? resolved.sources
        : null,
    Suggestions: selectedProvider?.Suggestions ?? HistorySuggestions,
  };
};
