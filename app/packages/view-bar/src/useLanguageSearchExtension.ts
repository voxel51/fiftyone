/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Text search for an index a registered text search extension searches
 * client-side, which the server cannot sort by: the extension runs it and
 * the result is published to the extended selection, which narrows the grid
 * without changing the view.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { viewFingerprint } from "./state";

export interface LanguageSearchExtension {
  /**
   * Runs `query` through the extension that searches `index`, ranking within
   * `sources` (null ranks every source); does nothing when no registered
   * extension searches it.
   */
  run: (
    index: PromptableSimilarityIndex,
    query: string,
    k: number,
    sources: string[] | null,
  ) => void;
  /** Drops the search in flight: nothing it returns is published. */
  cancel: () => void;
}

export const useLanguageSearchExtension = (
  /** Called when a search actually runs. */
  onRun: (index: PromptableSimilarityIndex, query: string) => void,
): LanguageSearchExtension => {
  const datasetId = fos.useCurrentDatasetId();
  const datasetName = fos.useCurrentDatasetName();
  const view = fos.useView();
  const filters = fos.useFilters();
  const extended = fos.useExtendedStages();
  const extensions = fos.useTextSearchExtensions();
  const publishExtendedSelection = fos.usePublishExtendedSelection();
  const setViewChangePending = fos.useSetViewChangePending();
  const notify = fos.useNotification();

  // Only the newest search may publish; null while none is in flight
  const searchSeq = useRef(0);
  const inFlight = useRef<number | null>(null);
  // Tells the running search to stop early. An extension may finish anyway,
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
      const extension = index.extension
        ? extensions.get(index.extension)
        : undefined;
      if (!extension || !datasetId || !datasetName) return;

      onRun(index, query);

      controller.current?.abort();
      const { signal } = (controller.current = new AbortController());
      const seq = ++searchSeq.current;
      inFlight.current = seq;
      // The in-progress treatment the field shows for any search. No view
      // change follows this one, so it is released below, not by the router
      setViewChangePending(true);
      // Through the executor, so an extension that throws before returning
      // its promise still reaches the failure handling below
      new Promise<fos.TextSearchResult | null>((resolve) =>
        resolve(
          extension.search({
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
      extensions,
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

  return { run, cancel };
};
