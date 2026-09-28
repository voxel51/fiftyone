/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Text search for whoever hosts the language search field: which index a
 * query runs with, how many matches it asks for, the dataset's previous
 * queries, and where it runs. An index the server sorts runs through the
 * similarity search operator; an index a registered text search provider
 * searches runs through that provider.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { executeOperator } from "@fiftyone/operators";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useState } from "react";

import {
  orderBySearchRecency,
  readIndexUses,
  readMatches,
  recordIndexUse,
  recordMatches,
} from "./searchIndexRecency";
import { patchesFieldOfView, resolveSearchIndex } from "./searchIndexSelection";
import { readSearchQueries, recordSearchQuery } from "./searchQueryHistory";
import type { SerializedStage } from "./state";
import { HistorySuggestions } from "./HistorySuggestions";
import { useProviderSearch } from "./useProviderSearch";
import { useOperatorSearch } from "./useOperatorSearch";

/**
 * How many samples a typed language query keeps, matching the modal
 * similarity search's default. The stage lands in the bar as a normal
 * pill, so the value is one click away from being changed.
 */
const LANGUAGE_SEARCH_K = 25;

/** What the language search field reads and drives. */
export interface TextSearchController {
  /**
   * The search can run for the selected index, or may once the operator
   * registry loads. Otherwise the field still shows, and a click explains
   * itself through `onUnavailable` instead of offering anything.
   */
  available: boolean;
  onUnavailable: () => void;
  /** A prompt-capable index exists: typing only searches with one. */
  enabled: boolean;
  /** The dataset's previous queries, most recent first. */
  history: readonly string[];
  /** The dataset's prompt-capable indexes, most recently used first. */
  promptKeys: PromptableSimilarityIndex[];
  /** The index a query runs with. */
  selectedIndex: PromptableSimilarityIndex | undefined;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  onOpenPanel: () => void;
  /** Runs `query`, ranking within `sources`; null ranks every source. */
  submit: (query: string, sources: string[] | null) => void;
  /** What the selected index's search wraps the field in, to say what it
   * offers for the typed text. */
  Suggestions: fos.TextSearchProvider["Suggestions"];
}

export interface TextSearch extends TextSearchController {
  /** Whether a search run here produced an arriving view. */
  claimView: (view: readonly SerializedStage[]) => boolean;
  /** Drops a search in flight that would otherwise publish over a cleared
   * view. */
  cancel: () => void;
}

export const useTextSearch = ({
  currentView,
  sortStageOffered,
}: {
  currentView: readonly SerializedStage[];
  /** The host can offer `SortBySimilarity`, which an operator search adds. */
  sortStageOffered: boolean;
}): TextSearch => {
  const datasetName = fos.useCurrentDatasetName();
  const trackEvent = useTrackEvent();
  const promptKeys = fos.usePromptableSimilarityKeys();
  const providers = fos.useTextSearchProviders();

  // Default ordering = the top 5 indexes actually searched with in the past
  // week (most recent first), then newest-created; an explicit pick
  // overrides. Session-local pick; per-dataset recency.
  const [explicitKey, setExplicitKey] = useState<string | null>(null);
  const [k, setK] = useState(
    () => (datasetName ? readMatches(datasetName) : null) ?? LANGUAGE_SEARCH_K,
  );
  const onChangeK = useCallback(
    (next: number) => {
      setK(next);
      if (datasetName) recordMatches(datasetName, next);
    },
    [datasetName],
  );
  // Bumps after every search so the ordering and history reflect the use
  // just recorded
  const [recencyStamp, setRecencyStamp] = useState(0);
  const history = useMemo(
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
  const selectedIndex = resolveSearchIndex(
    orderedPromptKeys,
    explicitKey,
    viewPatchesField,
  );

  const onRun = useCallback(
    (index: PromptableSimilarityIndex, query: string) => {
      if (datasetName) {
        recordIndexUse(datasetName, index.key);
        recordSearchQuery(datasetName, query);
        setRecencyStamp((stamp) => stamp + 1);
      }
      trackEvent("view_bar_text_search", {
        patches: Boolean(index.patchesField),
      });
    },
    [datasetName, trackEvent],
  );
  const operator = useOperatorSearch(currentView, onRun);
  const provider = useProviderSearch(onRun);

  const onOpenPanel = useCallback(() => {
    trackEvent("view_bar_search_settings_panel_opened");
    executeOperator("open_panel", {
      name: "similarity_search_panel",
      isActive: true,
      layout: "horizontal",
    });
  }, [trackEvent]);

  const submit = useCallback(
    (query: string, sources: string[] | null) => {
      if (!selectedIndex) return;
      if (selectedIndex.provider) {
        // Never to the operator, even with its provider gone: the server
        // cannot sort this index
        provider.run(selectedIndex, query, k, sources);
        return;
      }
      // A provider search still running would publish its result, and end
      // the pending state, over this one
      provider.cancel();
      operator.run(selectedIndex, query, k, sources);
    },
    [selectedIndex, provider, operator, k],
  );

  // A provider searches client-side and publishes to the extended
  // selection: it needs neither the operator nor `SortBySimilarity`
  const providerSearch = Boolean(selectedIndex?.provider);

  return {
    available: operator.available || providerSearch,
    onUnavailable: operator.onUnavailable,
    enabled:
      providerSearch ||
      (operator.available && promptKeys.length > 0 && sortStageOffered),
    history,
    promptKeys: orderedPromptKeys,
    selectedIndex,
    onSelectKey: setExplicitKey,
    k,
    onChangeK,
    onOpenPanel,
    submit,
    Suggestions:
      (selectedIndex?.provider &&
        providers.get(selectedIndex.provider)?.Suggestions) ||
      HistorySuggestions,
    claimView: operator.claimView,
    cancel: provider.cancel,
  };
};
