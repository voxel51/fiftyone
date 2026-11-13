/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Which similarity index the quick search reaches for: the ones the user
 * actually searched with recently come first — the top 5 used within the
 * past week, most recent first — and everything else follows in
 * newest-created order (the input order). With no recent use at all, the
 * ordering IS newest-created, so a fresh dataset behaves as before.
 *
 * Recency is a client-side memory (localStorage, keyed per dataset): the
 * data model has no "last searched with" field, and a per-browser memory is
 * exactly the scope the convenience wants.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";

const STORAGE_KEY = "fiftyone-quick-search-index-recency";

export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENT_CAP = 5;

/** dataset → index key → last-used epoch ms. */
type RecencyStore = Record<string, Record<string, number>>;

const read = (): RecencyStore => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const write = (store: RecencyStore): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage may be unavailable (private mode, quota) — recency is a
    // convenience, never worth failing a search over
  }
};

/** Record that `key` just ran a quick search on `dataset`. */
export const recordIndexUse = (
  dataset: string,
  key: string,
  now: number = Date.now(),
): void => {
  const store = read();
  const forDataset = { ...(store[dataset] ?? {}), [key]: now };

  // prune entries outside the window so the record can't grow unbounded
  for (const [k, ts] of Object.entries(forDataset)) {
    if (now - ts > RECENT_WINDOW_MS) {
      delete forDataset[k];
    }
  }

  write({ ...store, [dataset]: forDataset });
};

/** The last-used timestamps for `dataset`, for ordering. */
export const readIndexUses = (dataset: string): Record<string, number> =>
  read()[dataset] ?? {};

/**
 * Order `promptKeys` (given newest-created first) by the rule above. Pure —
 * `uses` and `now` injected so it unit-tests without a browser.
 */
export const orderBySearchRecency = (
  promptKeys: PromptableSimilarityIndex[],
  uses: Record<string, number>,
  now: number = Date.now(),
): PromptableSimilarityIndex[] => {
  const recent = promptKeys
    .filter((index) => {
      const ts = uses[index.key];
      return ts !== undefined && now - ts <= RECENT_WINDOW_MS;
    })
    .sort((a, b) => (uses[b.key] ?? 0) - (uses[a.key] ?? 0))
    .slice(0, RECENT_CAP);

  const recentKeys = new Set(recent.map((index) => index.key));
  const rest = promptKeys.filter((index) => !recentKeys.has(index.key));

  return [...recent, ...rest];
};
