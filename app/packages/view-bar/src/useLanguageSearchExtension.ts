/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The language search field's own search, for an index a registered text
 * search extension searches client-side. The field hands such a query here
 * instead of to the view bar's server search: the extension runs it and the
 * result is published to the extended selection, which narrows the grid
 * without changing the view.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef, useState } from "react";

import { recordIndexUse } from "./searchIndexRecency";
import { recordSearchQuery, rememberQuery } from "./searchQueryHistory";

export interface LanguageSearchExtension {
  /**
   * Runs `query` through the extension that searches `index`. Returns false,
   * doing nothing, when no registered extension searches it.
   */
  run: (index: PromptableSimilarityIndex, query: string, k: number) => boolean;
  /** Queries run here, most recent first. The bar reads the stored history
   * when it mounts, so these would otherwise be missing until it remounts. */
  recentQueries: readonly string[];
}

export const useLanguageSearchExtension = (): LanguageSearchExtension => {
  const datasetName = fos.useCurrentDatasetName();
  const extensions = fos.useTextSearchExtensions();
  const publishExtendedSelection = fos.usePublishExtendedSelection();
  const setViewChangePending = fos.useSetViewChangePending();
  const notify = fos.useNotification();
  const trackEvent = useTrackEvent();
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Only the newest search may publish; null while none is in flight
  const searchSeq = useRef(0);
  const inFlight = useRef<number | null>(null);

  // A search still running when the field goes away (it remounts per
  // dataset) must not publish into the next one, nor leave its pending
  // treatment on
  useEffect(
    () => () => {
      searchSeq.current += 1;
      if (inFlight.current !== null) {
        inFlight.current = null;
        setViewChangePending(false);
      }
    },
    [setViewChangePending],
  );

  const run = useCallback(
    (index: PromptableSimilarityIndex, query: string, k: number) => {
      const extension = index.extension
        ? extensions.get(index.extension)
        : undefined;
      if (!extension || !datasetName) return false;

      recordIndexUse(datasetName, index.key);
      recordSearchQuery(datasetName, query);
      setRecentQueries((queries) => rememberQuery(queries, query));
      trackEvent("view_bar_text_search", { patches: false });

      const seq = ++searchSeq.current;
      inFlight.current = seq;
      // The in-progress treatment the field shows for any search. No view
      // change follows this one, so it is released below, not by the router
      setViewChangePending(true);
      // Through the executor, so an extension that throws before returning
      // its promise still reaches the failure handling below
      new Promise<fos.TextSearchResult>((resolve) =>
        resolve(
          extension.search({
            datasetName,
            brainKey: index.key,
            runTimestamp: index.timestamp ?? null,
            query,
            k,
          }),
        ),
      )
        .then((result) => {
          if (seq !== searchSeq.current) return;
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
      return true;
    },
    [
      extensions,
      datasetName,
      publishExtendedSelection,
      setViewChangePending,
      notify,
      trackEvent,
    ],
  );

  return { run, recentQueries };
};
