/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What the selected index's text search extension offers for the typed
 * prompt. Its suggestions are loaded whenever `loadCount` changes (the list
 * opening, or the extension asking to refresh), and matched against every
 * keystroke here.
 */

import type {
  PromptableSimilarityIndex,
  TextSearchExtension,
  TextSearchIndex,
  TextSearchSuggestions,
} from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";

export interface SearchSuggestions {
  /**
   * - `open`: previous queries and the extension's prompts; any text runs.
   * - `pending`: nothing loaded yet; previous queries only, and no typed text
   *   runs.
   * - `offered`: only the extension's prompts, and its actions, can run.
   */
  mode: "open" | "pending" | "offered";
  prompts: string[];
  actions: { id: string; label: string }[];
  /** Nothing has loaded for this index yet, and a load is in flight. */
  loading: boolean;
  index: TextSearchIndex;
  EmptyList: TextSearchExtension["EmptyList"];
  Action: TextSearchExtension["Action"];
}

/** How much of a prompt is typed before an extension's prompts are
 * suggested; previous queries match from the first character. */
const SUGGEST_AFTER = 3;

const NO_PROMPTS: string[] = [];
const NO_ACTIONS: { id: string; label: string }[] = [];
const REFUSED: TextSearchSuggestions = { prompts: [], freeText: false };

/** Whether `text` is offered for the typed `draft`: every text matches an
 * empty draft, and otherwise ignoring case. */
export function matchesDraft(text: string, draft: string): boolean {
  const q = draft.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

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

  // Tagged with the index it answers, so another index's prompts are never
  // offered; a later load for the same index replaces it once it resolves
  const [loaded, setLoaded] = useState<{
    brainKey: string;
    runTimestamp: string | null;
    suggestions: TextSearchSuggestions;
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
    const settle = (suggestions: TextSearchSuggestions) => {
      if (!live) return;
      setLoaded({ brainKey, runTimestamp, suggestions });
      setLoadingFor((current) => (current === loadKey ? null : current));
    };
    extension
      .loadSuggestions({ datasetName, brainKey, runTimestamp })
      .then(settle, (error: unknown) => {
        console.error("Search suggestions unavailable:", error);
        settle(REFUSED);
      });
    return () => {
      live = false;
    };
  }, [extension, datasetName, brainKey, runTimestamp, loadCount]);

  const offered =
    loaded?.brainKey === brainKey && loaded?.runTimestamp === runTimestamp
      ? loaded.suggestions
      : null;
  const loading = !offered && loadingFor !== null;
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
    if (!offered) {
      return {
        ...base,
        mode: "pending" as const,
        prompts: NO_PROMPTS,
        actions: NO_ACTIONS,
      };
    }

    const suggested =
      query.trim().length >= SUGGEST_AFTER
        ? offered.prompts.filter((text) => matchesDraft(text, query))
        : NO_PROMPTS;
    if (offered.freeText) {
      return {
        ...base,
        mode: "open" as const,
        prompts: suggested,
        actions: NO_ACTIONS,
      };
    }

    // Only what the index can answer runs, previous queries included
    const runnable = new Set(offered.prompts);
    const previous = history.filter(
      (text) => runnable.has(text) && matchesDraft(text, query),
    );
    return {
      ...base,
      mode: "offered" as const,
      prompts: [
        ...previous,
        ...suggested.filter((text) => !previous.includes(text)),
      ],
      actions: offered.actions ?? NO_ACTIONS,
    };
  }, [
    extension,
    datasetName,
    brainKey,
    runTimestamp,
    EmptyList,
    Action,
    loading,
    offered,
    query,
    history,
  ]);
};
