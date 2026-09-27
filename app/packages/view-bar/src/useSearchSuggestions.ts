/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What the selected index's text search extension offers for the typed
 * prompt. Its suggester is loaded whenever `loadCount` changes (the list
 * opening, or the extension asking to refresh), and every keystroke is
 * refined by the suggester alone.
 */

import type {
  PromptableSimilarityIndex,
  TextSearchExtension,
  TextSearchIndex,
  TextSearchSuggester,
} from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";

export interface SearchSuggestions {
  /**
   * - `open`: previous queries and the extension's prompts; any text runs.
   * - `pending`: no suggester yet; previous queries only, and no typed text
   *   runs.
   * - `offered`: only the extension's prompts, and its actions, can run.
   */
  mode: "open" | "pending" | "offered";
  prompts: string[];
  actions: { id: string; label: string }[];
  /** No suggester has loaded for this index yet, and one is loading. */
  loading: boolean;
  index: TextSearchIndex;
  EmptyList: TextSearchExtension["EmptyList"];
  Action: TextSearchExtension["Action"];
}

const NO_PROMPTS: string[] = [];
const NO_ACTIONS: { id: string; label: string }[] = [];
const REFUSE_ALL: TextSearchSuggester = () => ({
  prompts: [],
  freeText: false,
});

/** Null when the index's extension suggests nothing: previous queries only,
 * and any text runs. */
export const useSearchSuggestions = (
  index: PromptableSimilarityIndex | undefined,
  query: string,
  history: readonly string[],
  loadCount: number,
): SearchSuggestions | null => {
  const datasetName = fos.useCurrentDatasetName();
  const extensions = fos.useTextSearchExtensions();
  const extension = index?.extension
    ? extensions.get(index.extension)
    : undefined;
  const brainKey = index?.key ?? null;
  const runTimestamp = index?.timestamp ?? null;

  // Tagged with the index it answers, so another index's suggester never
  // runs; a later load for the same index replaces it once it resolves
  const [loaded, setLoaded] = useState<{
    brainKey: string;
    runTimestamp: string | null;
    suggester: TextSearchSuggester;
  } | null>(null);
  const [loadingFor, setLoadingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!loadCount || !extension?.loadSuggestions || !datasetName) {
      return undefined;
    }
    if (!brainKey) return undefined;
    let live = true;
    const loadKey = JSON.stringify([brainKey, runTimestamp, loadCount]);
    setLoadingFor(loadKey);
    const settle = (suggester: TextSearchSuggester) => {
      if (!live) return;
      setLoaded({ brainKey, runTimestamp, suggester });
      setLoadingFor((current) => (current === loadKey ? null : current));
    };
    extension
      .loadSuggestions({ datasetName, brainKey, runTimestamp })
      .then(settle, (error: unknown) => {
        console.error("Search suggestions unavailable:", error);
        settle(REFUSE_ALL);
      });
    return () => {
      live = false;
    };
  }, [extension, datasetName, brainKey, runTimestamp, loadCount]);

  const suggester =
    loaded?.brainKey === brainKey && loaded?.runTimestamp === runTimestamp
      ? loaded.suggester
      : null;
  const loading = !suggester && loadingFor !== null;
  const EmptyList = extension?.EmptyList;
  const Action = extension?.Action;

  return useMemo(() => {
    if (!extension?.loadSuggestions || !datasetName || !brainKey) return null;
    const base = {
      index: { datasetName, brainKey, runTimestamp },
      EmptyList,
      Action,
      loading,
    };
    if (!suggester) {
      return {
        ...base,
        mode: "pending" as const,
        prompts: NO_PROMPTS,
        actions: NO_ACTIONS,
      };
    }

    let answer: ReturnType<TextSearchSuggester>;
    try {
      answer = suggester(query, history);
    } catch (error) {
      console.error("Search suggestions failed:", error);
      answer = REFUSE_ALL(query, history);
    }

    return {
      ...base,
      mode: answer.freeText ? ("open" as const) : ("offered" as const),
      prompts: answer.prompts,
      actions: answer.actions ?? NO_ACTIONS,
    };
  }, [
    extension,
    datasetName,
    brainKey,
    runTimestamp,
    EmptyList,
    Action,
    loading,
    suggester,
    query,
    history,
  ]);
};
