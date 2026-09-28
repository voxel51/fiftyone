/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Text search through the server's similarity search operator, for an index
 * the server can sort by. The operator builds and applies the result view
 * itself; whoever shows the view hands each arriving one to `claimView`.
 */

import {
  executeOperator,
  useOperatorAvailability,
  useOperatorRegistryState,
} from "@fiftyone/operators";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { buildSimilarityRunName } from "@fiftyone/utilities";
import { useCallback, useRef } from "react";

import { HistorySuggestions } from "./HistorySuggestions";
import type { SearchStrategy } from "./searchStrategy";
import { type SerializedStage, viewFingerprint } from "./state";
import { useDeferredSearch } from "./useDeferredSearch";

/** The Similarity action's server-side search operator. */
export const SIMILARITY_SEARCH_OPERATOR = "@voxel51/panels/similarity_search";

export interface OperatorSearch extends SearchStrategy {
  onUnavailable: () => void;
  /** Whether a search run here produced an arriving view. */
  claimView: (view: readonly SerializedStage[]) => boolean;
}

export const useOperatorSearch = ({
  currentView,
  onRun,
  sortStageOffered,
}: {
  currentView: readonly SerializedStage[];
  /** Called when a search actually runs, not when one is held. */
  onRun: (index: PromptableSimilarityIndex, query: string) => void;
  /** The host can offer `SortBySimilarity`, which the operator adds. */
  sortStageOffered: boolean;
}): OperatorSearch => {
  const setViewChangePending = fos.useSetViewChangePending();
  const notify = fos.useNotification();
  const registryState = useOperatorRegistryState();
  const registered = useOperatorAvailability(SIMILARITY_SEARCH_OPERATOR);

  // The run a submitted search created, then, once its view lands, the
  // fingerprint of that view
  const pendingRunId = useRef<string | null>(null);
  const lastSearch = useRef<{ runId: string; viewFp: string } | null>(null);

  const onUnavailable = useCallback(
    () =>
      notify({
        key: "view-bar-search-unavailable",
        msg: "Natural language search is not available",
      }),
    [notify],
  );

  const submit = useCallback(
    ({
      index,
      query,
      k,
    }: {
      index: PromptableSimilarityIndex;
      query: string;
      k: number;
    }) => {
      onRun(index, query);
      // The pending treatment every view change gets, for the operator's
      // whole run: the router clears it when the resulting entry loads
      setViewChangePending(true);
      const params: Record<string, unknown> = {
        brain_key: index.key,
        query_type: "text",
        query,
        reverse: false,
        k,
        run_name: buildSimilarityRunName({
          isImageSearch: false,
          textQuery: query,
          patchesField: index.patchesField ?? undefined,
        }),
        view_target: "CURRENT_VIEW",
        // The run applies its own results, the same view the panel's Apply
        // builds, without needing the panel
        apply_results: true,
      };
      if (index.patchesField) {
        params.patches_field = index.patchesField;
      }
      if (
        lastSearch.current &&
        viewFingerprint(currentView) === lastSearch.current.viewFp
      ) {
        // Typed over an unmodified result view: replace that search
        params.replace_run_id = lastSearch.current.runId;
      }
      executeOperator(SIMILARITY_SEARCH_OPERATOR, params, {
        callback: (result) => {
          if (result?.error) {
            // No view change is coming, so nothing will clear the pending
            // treatment
            setViewChangePending(false);
            console.error("Similarity search failed:", result.error);
            return;
          }
          pendingRunId.current =
            (result?.result as { run_id?: string } | undefined)?.run_id ?? null;
        },
      });
    },
    [onRun, setViewChangePending, currentView],
  );

  // A held query gets the same in-flight treatment a running one does, so
  // Enter always answers with something
  const hold = useCallback(
    () => setViewChangePending(true),
    [setViewChangePending],
  );
  const drop = useCallback(
    () => setViewChangePending(false),
    [setViewChangePending],
  );
  const deferred = useDeferredSearch({
    settled: registryState !== "loading",
    registered,
    submit,
    onUnavailable,
    onHold: hold,
    onDrop: drop,
  });

  const run = useCallback(
    (index: PromptableSimilarityIndex, query: string, k: number) =>
      deferred({ index, query, k }),
    [deferred],
  );

  // Called with every view that arrives: whether a search run here produced
  // it. A following search typed over an unmodified result view replaces
  // that search instead of refining its results down again
  const claimView = useCallback((view: readonly SerializedStage[]) => {
    const fromSearch = pendingRunId.current !== null;
    if (pendingRunId.current) {
      lastSearch.current = {
        runId: pendingRunId.current,
        viewFp: viewFingerprint(view),
      };
      pendingRunId.current = null;
    } else if (
      lastSearch.current &&
      viewFingerprint(view) !== lastSearch.current.viewFp
    ) {
      // Any other view change supersedes the chain, and a next search
      // targets the view as it is
      lastSearch.current = null;
    }
    return fromSearch;
  }, []);

  // Until the registry loads the operator is not missing, only unknown: a
  // query is held and runs, or explains itself, once it lands
  const available = registered || registryState === "loading";

  return {
    available,
    enabled: available && sortStageOffered,
    onUnavailable,
    run,
    claimView,
    // The operator's searches cannot be narrowed
    sources: null,
    Suggestions: HistorySuggestions,
  };
};
