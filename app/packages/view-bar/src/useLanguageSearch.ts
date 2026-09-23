/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The view bar's language search: which index it runs with, how many matches
 * it asks for, the dataset's previous queries, and running a query — through
 * the server-side similarity search operator, or through a registered text
 * search backend for indexes the server cannot sort by. Also owns search
 * chaining (a search typed over an unmodified result view replaces it) and
 * the annotations a backend publishes beside its view.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import {
  executeOperator,
  useOperatorAvailability,
  useOperatorRegistryState,
} from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { buildSimilarityRunName } from "@fiftyone/utilities";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import type { LanguageSearchProps } from "./LanguageSearch";
import {
  orderBySearchRecency,
  readIndexUses,
  readMatches,
  recordIndexUse,
  recordMatches,
} from "./searchIndexRecency";
import { readSearchQueries, recordSearchQuery } from "./searchQueryHistory";
import { patchesFieldOfView, resolveSearchIndex } from "./searchIndexSelection";
import { viewFingerprint } from "./state";
import { useDeferredSearch } from "./useDeferredSearch";

/**
 * How many samples a typed language query keeps, matching the modal
 * similarity search's default. The stage lands in the bar as a normal
 * pill, so the value is one click away from being changed.
 */
const LANGUAGE_SEARCH_K = 25;

/** The Similarity action's server-side search operator. */
const SIMILARITY_SEARCH_OPERATOR = "@voxel51/panels/similarity_search";

/**
 * What a follow-up search replaces: the operator's run, which records its own
 * base view, or — for a search a backend ran in the browser — the view its
 * stage was appended to, and what that backend annotates its view with.
 */
interface SearchOrigin {
  runId: string | null;
  base: fos.State.Stage[] | null;
  decorate: (() => void) | null;
  withdraw: (() => void) | null;
  /** The fingerprint of the view a backend search sent; null for an
   * operator run, whose resulting view only the server knows. */
  expectedFp: string | null;
}

export interface LanguageSearchOptions {
  /** Whether the bar may offer a stage by this name here. */
  offersStage: (name: string) => boolean;
  /** Called with each view a backend search sends, before it lands. */
  onViewSent: (view: fos.State.Stage[]) => void;
}

export interface LanguageSearch {
  /** Everything the search field takes, bar layout aside. */
  props: Omit<LanguageSearchProps, "onHasTextChange" | "onFocus">;
  /**
   * Tells the search a view arrived, before the bar rebuilds from it. Returns
   * whether a search produced it — the search says what it did in the box it
   * was typed in, so the bar need not reveal its stages.
   */
  observeView: (view: fos.State.Stage[]) => boolean;
  /** Drops the search in flight, if any: the bar is replacing the view. */
  cancel: () => void;
}

export const useLanguageSearch = ({
  offersStage,
  onViewSent,
}: LanguageSearchOptions): LanguageSearch => {
  const currentView = fos.useView();
  const datasetName = fos.useCurrentDatasetName();
  const setView = fos.useSetView();
  const setViewChangePending = fos.useSetViewChangePending();
  const trackEvent = useTrackEvent();
  const notify = fos.useNotification();

  // Search chaining: what a submitted search replaces from — the run it
  // created, or for a backend-run search the view it was appended to — then,
  // once its view lands, the fingerprint of that view. A following search
  // typed over an unmodified result view REPLACES the search instead of
  // refining 25 results down to 25 results.
  const pendingSearch = useRef<SearchOrigin | null>(null);
  const lastSearch = useRef<(SearchOrigin & { viewFp: string }) | null>(null);
  // Only the newest backend-run search may apply its view; null while none
  // is in flight
  const backendSearchSeq = useRef(0);
  const backendSearchInFlight = useRef<number | null>(null);
  // The view as of the latest render: a backend search resolves long after
  // the render that submitted it, and the view may have moved on since
  const latestView = useRef(currentView);
  latestView.current = currentView;
  // A search's annotations stand exactly as long as its view does
  const swapSearchDecorations = useCallback(
    (previous: SearchOrigin | null, next: SearchOrigin | null) => {
      if (previous === next) return;
      previous?.withdraw?.();
      next?.decorate?.();
    },
    [],
  );

  const observeView = useCallback(
    (view: fos.State.Stage[]) => {
      const pending = pendingSearch.current;
      // Only the view a search sent is its result: a rollback of that view,
      // or another change landing first, is not
      const fromSearch =
        pending !== null &&
        (pending.expectedFp === null ||
          pending.expectedFp === viewFingerprint(view));
      const previousSearch = lastSearch.current;
      // A just-searched run owns the arriving view; any other view change
      // supersedes the chain and a next search targets the view as-is
      if (pending && fromSearch) {
        lastSearch.current = { ...pending, viewFp: viewFingerprint(view) };
        pendingSearch.current = null;
      } else if (
        lastSearch.current &&
        viewFingerprint(view) !== lastSearch.current.viewFp
      ) {
        lastSearch.current = null;
      }
      swapSearchDecorations(previousSearch, lastSearch.current);
      return fromSearch;
    },
    [swapSearchDecorations],
  );

  /**
   * Drops the backend search in flight, if any: whatever superseded it owns
   * the view now. Its pending treatment is released, since the view change
   * that would have cleared it may never come.
   */
  const cancel = useCallback(() => {
    // A search whose view is still in transit is superseded as well: that
    // view, if it lands, is no longer the bar's search result
    pendingSearch.current = null;
    if (backendSearchInFlight.current === null) return;
    backendSearchInFlight.current = null;
    backendSearchSeq.current += 1;
    setViewChangePending(false);
  }, [setViewChangePending]);

  // Leaving (the bar remounts per dataset) takes the search's annotations
  // with it: nothing else would ever withdraw them
  useEffect(
    () => () => {
      cancel();
      lastSearch.current?.withdraw?.();
    },
    [cancel],
  );

  const promptKeys = fos.usePromptableSimilarityKeys();
  const textSearchBackends = fos.useTextSearchBackends();
  // The search runs through the similarity_search operator. The registry
  // that lists it loads after the bar renders, so until it has, the operator
  // is not missing — only unknown: the field takes the query and
  // `useDeferredSearch` holds it. Known missing (an install without the
  // plugin, or a listing that failed) is when a click explains itself instead.
  const registryState = useOperatorRegistryState();
  const searchOperatorRegistered = useOperatorAvailability(
    SIMILARITY_SEARCH_OPERATOR,
  );
  const searchOperatorAvailable =
    searchOperatorRegistered || registryState === "loading";
  // An index searched by a registered backend needs no operator
  const hasBackendIndex = promptKeys.some((index) => index.backend);
  const searchAvailable = searchOperatorAvailable || hasBackendIndex;
  const notifySearchUnavailable = useCallback(
    () =>
      notify({
        key: "view-bar-search-unavailable",
        msg: "Natural language search is not available",
      }),
    [notify],
  );
  // The language search turns Enter into a SortBySimilarity stage — or, for
  // a backend-run index, the Select its backend answers with — so it needs a
  // prompt-capable index and that stage to be offerable here
  const operatorSearchable =
    searchOperatorAvailable && offersStage("SortBySimilarity");
  const searchEnabled = promptKeys.some((index) =>
    index.backend ? offersStage("Select") : operatorSearchable,
  );

  // The search settings popover: which index the search uses and how many
  // matches it asks for. Default ordering = the top 5 indexes actually
  // searched with in the past week (most recent first), then newest-created;
  // an explicit pick overrides. Session-local pick; per-dataset recency.
  const [searchIndexKey, setSearchIndexKey] = React.useState<string | null>(
    null,
  );
  const [searchK, setSearchK] = React.useState(
    () => (datasetName ? readMatches(datasetName) : null) ?? LANGUAGE_SEARCH_K,
  );
  const changeSearchK = useCallback(
    (k: number) => {
      setSearchK(k);
      if (datasetName) {
        recordMatches(datasetName, k);
      }
    },
    [datasetName],
  );
  // bumps after every search so the ordering reflects the use just recorded
  const [recencyStamp, setRecencyStamp] = React.useState(0);
  const searchHistory = useMemo(
    () => (datasetName ? readSearchQueries(datasetName) : []),
    // recencyStamp invalidates the localStorage read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetName, recencyStamp],
  );
  const orderedPromptKeys = useMemo(
    () =>
      orderBySearchRecency(
        promptKeys,
        datasetName ? readIndexUses(datasetName) : {},
      ),
    // recencyStamp invalidates the localStorage read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promptKeys, datasetName, recencyStamp],
  );
  // A view standing in patches prefers a patches index on its field: a
  // sample-level index cannot rank patches, and the server would flatten
  // the view (dropping ToPatches) to satisfy it. An explicit pick wins.
  const viewPatchesField = useMemo(
    () => patchesFieldOfView(currentView),
    [currentView],
  );
  const resolvedSearchIndex = resolveSearchIndex(
    orderedPromptKeys,
    searchIndexKey,
    viewPatchesField,
  );

  const openSimilarityPanel = useCallback(() => {
    trackEvent("view_bar_search_settings_panel_opened");
    executeOperator("open_panel", {
      name: "similarity_search_panel",
      isActive: true,
      layout: "horizontal",
    });
  }, [trackEvent]);

  const submitLanguageQuery = useCallback(
    (query: string) => {
      // The settings popover's picked index, else the most recently computed
      // prompt-capable one — never an index that cannot embed the typed prompt
      const index = resolvedSearchIndex;
      if (!index) return;
      const backend = index.backend
        ? textSearchBackends.get(index.backend)
        : undefined;
      if (index.backend && (!backend || !datasetName)) return;
      if (datasetName) {
        recordIndexUse(datasetName, index.key);
        recordSearchQuery(datasetName, query);
        setRecencyStamp((stamp) => stamp + 1);
      }
      trackEvent("view_bar_text_search", {
        patches: Boolean(index.patchesField),
      });
      cancel();
      // The pending treatment every view change gets, for the search's
      // whole run — the router clears it when the resulting entry loads
      setViewChangePending(true);
      if (backend && datasetName) {
        const base =
          lastSearch.current?.base &&
          viewFingerprint(currentView) === lastSearch.current.viewFp
            ? lastSearch.current.base
            : currentView;
        const submittedFp = viewFingerprint(currentView);
        const seq = ++backendSearchSeq.current;
        backendSearchInFlight.current = seq;
        const settle = () => {
          if (seq !== backendSearchSeq.current) return false;
          backendSearchInFlight.current = null;
          return true;
        };
        // Through the executor, so a backend that throws before returning its
        // promise still reaches the failure handling below
        new Promise<fos.TextSearchResult>((resolve) =>
          resolve(
            backend.search({
              datasetName,
              brainKey: index.key,
              runTimestamp: index.timestamp ?? null,
              query,
              k: searchK,
            }),
          ),
        )
          .then((result) => {
            if (!settle()) return;
            const current = latestView.current;
            if (viewFingerprint(current) !== submittedFp) {
              // The view changed while the search ran; applying the result
              // onto the old base would silently undo that change
              setViewChangePending(false);
              return;
            }
            const view = [...base, result.stage];
            const origin: SearchOrigin = {
              runId: null,
              base,
              decorate: result.decorate ?? null,
              withdraw: result.withdraw ?? null,
              expectedFp: viewFingerprint(view),
            };
            if (viewFingerprint(view) === viewFingerprint(current)) {
              // No view change is coming to clear the pending treatment, or
              // to swap the annotations — the new search's may differ
              setViewChangePending(false);
              const next = { ...origin, viewFp: viewFingerprint(current) };
              swapSearchDecorations(lastSearch.current, next);
              lastSearch.current = next;
              return;
            }
            pendingSearch.current = origin;
            setView(view);
            onViewSent(view);
          })
          .catch((error: unknown) => {
            // A newer search owns the pending treatment and the view
            if (!settle()) return;
            setViewChangePending(false);
            console.error("Similarity search failed:", error);
            notify({
              key: "view-bar-search-failed",
              msg: error instanceof Error ? error.message : String(error),
              variant: "error",
            });
          });
        return;
      }
      // The same route the Similarity action takes: the server-side search
      // operator owns building and applying the view, and the bar hydrates
      // from the view change like any other external edit
      const params: Record<string, unknown> = {
        brain_key: index.key,
        query_type: "text",
        query,
        reverse: false,
        k: searchK,
        run_name: buildSimilarityRunName({
          isImageSearch: false,
          textQuery: query,
          patchesField: index.patchesField ?? undefined,
        }),
        view_target: "CURRENT_VIEW",
        // The run applies its own results — the same view the panel's
        // Apply builds, without needing the panel
        apply_results: true,
      };
      if (index.patchesField) {
        params.patches_field = index.patchesField;
      }
      if (
        lastSearch.current?.runId &&
        viewFingerprint(currentView) === lastSearch.current.viewFp
      ) {
        // Typed over an unmodified result view: replace that search
        params.replace_run_id = lastSearch.current.runId;
      }
      executeOperator(SIMILARITY_SEARCH_OPERATOR, params, {
        callback: (result) => {
          if (result?.error) {
            // No view change is coming, so nothing will clear the pending
            // treatment — release it here
            setViewChangePending(false);
            console.error("Similarity search failed:", result.error);
            return;
          }
          const runId =
            (result?.result as { run_id?: string } | undefined)?.run_id ?? null;
          pendingSearch.current = runId
            ? {
                runId,
                base: null,
                decorate: null,
                withdraw: null,
                expectedFp: null,
              }
            : null;
        },
      });
    },
    [
      resolvedSearchIndex,
      textSearchBackends,
      datasetName,
      trackEvent,
      setViewChangePending,
      currentView,
      searchK,
      setView,
      onViewSent,
      notify,
      swapSearchDecorations,
      cancel,
    ],
  );

  // A held query gets the same in-flight treatment a running one does, so
  // Enter always answers with something
  const holdSearch = useCallback(
    () => setViewChangePending(true),
    [setViewChangePending],
  );
  const dropSearch = useCallback(
    () => setViewChangePending(false),
    [setViewChangePending],
  );
  // A backend-run index waits on no operator registry
  const searchesByBackend = Boolean(resolvedSearchIndex?.backend);
  const submitSearch = useDeferredSearch({
    settled: registryState !== "loading" || searchesByBackend,
    registered: searchOperatorRegistered || searchesByBackend,
    submit: submitLanguageQuery,
    onUnavailable: notifySearchUnavailable,
    onHold: holdSearch,
    onDrop: dropSearch,
  });

  return {
    props: {
      onSubmit: submitSearch,
      available: searchAvailable,
      onUnavailable: notifySearchUnavailable,
      enabled: searchEnabled,
      history: searchHistory,
      promptKeys: orderedPromptKeys,
      selectedKey: resolvedSearchIndex?.key ?? null,
      onSelectKey: setSearchIndexKey,
      k: searchK,
      onChangeK: changeSearchK,
      onOpenPanel: openSimilarityPanel,
    },
    observeView,
    cancel,
  };
};
