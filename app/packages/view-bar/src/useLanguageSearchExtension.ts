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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recordIndexUse } from "./searchIndexRecency";
import { recordSearchQuery, rememberQuery } from "./searchQueryHistory";
import { viewFingerprint } from "./state";

export interface LanguageSearchExtension {
  /**
   * Runs `query` through the extension that searches `index`. Returns false,
   * doing nothing, when no registered extension searches it.
   */
  run: (index: PromptableSimilarityIndex, query: string, k: number) => boolean;
  /** Drops the search in flight, if any: it will not publish, and its
   * pending treatment is released. */
  cancel: () => void;
  /** Queries run here, most recent first. The bar reads the stored history
   * when it mounts, so these would otherwise be missing until it remounts. */
  recentQueries: readonly string[];
}

export const useLanguageSearchExtension = (): LanguageSearchExtension => {
  const datasetName = fos.useCurrentDatasetName();
  const view = fos.useView();
  const extensions = fos.useTextSearchExtensions();
  const publishExtendedSelection = fos.usePublishExtendedSelection();
  const pending = fos.useViewChangePending();
  const setViewChangePending = fos.useSetViewChangePending();
  const notify = fos.useNotification();
  const trackEvent = useTrackEvent();
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Only the newest search may publish; null while none is in flight
  const searchSeq = useRef(0);
  const inFlight = useRef<number | null>(null);

  const cancel = useCallback(() => {
    searchSeq.current += 1;
    if (inFlight.current !== null) {
      inFlight.current = null;
      setViewChangePending(false);
    }
  }, [setViewChangePending]);

  // A search still running when the field goes away (it is keyed by
  // dataset) must not publish into the next one, nor leave its pending
  // treatment on
  useEffect(() => cancel, [cancel]);

  // A search answers the view it was typed over. Once the view changes —
  // stages applied, an operator, navigation — its result would narrow a view
  // nobody searched
  const viewFp = useMemo(() => viewFingerprint(view), [view]);
  useEffect(() => cancel(), [viewFp, cancel]);

  const run = useCallback(
    (index: PromptableSimilarityIndex, query: string, k: number) => {
      const extension = index.extension
        ? extensions.get(index.extension)
        : undefined;
      if (!extension || !datasetName) return false;

      // Set with none of this hook's searches in flight, the pending flag is
      // a server search's. It cannot be cancelled, and the view it lands
      // resets the extended selection, so a result published now would be
      // wiped by the older query's — this one waits for it instead
      if (pending && inFlight.current === null) {
        notify({
          key: "view-bar-text-search-busy",
          msg: "Wait for the current search to finish",
        });
        return true;
      }

      recordIndexUse(datasetName, index.key);
      recordSearchQuery(datasetName, query);
      setRecentQueries((queries) => rememberQuery(queries, query));
      trackEvent("view_bar_text_search", {
        patches: Boolean(index.patchesField),
      });

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
            datasetName,
            brainKey: index.key,
            runTimestamp: index.timestamp ?? null,
            query,
            k,
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
      return true;
    },
    [
      extensions,
      datasetName,
      publishExtendedSelection,
      pending,
      setViewChangePending,
      notify,
      trackEvent,
    ],
  );

  return { run, cancel, recentQueries };
};
