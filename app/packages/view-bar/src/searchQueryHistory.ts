/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The quick search's previous queries, offered when the input takes focus.
 * A client-side memory (localStorage, keyed per dataset), like the index
 * recency beside it — the data model has no "past searches" to ask for.
 */

const STORAGE_KEY = "fiftyone-quick-search-queries";

/** How many previous queries the dropdown offers. */
export const QUERY_HISTORY_CAP = 8;

/** dataset → queries, most recent first. */
type HistoryStore = Record<string, string[]>;

const read = (): HistoryStore => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

/** Remember that `query` just ran on `dataset`. */
export const recordSearchQuery = (dataset: string, query: string): void => {
  const trimmed = query.trim();
  if (!trimmed) return;

  try {
    const store = read();
    const queries = rememberQuery(store[dataset] ?? [], trimmed);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...store, [dataset]: queries }),
    );
  } catch {
    // storage may be unavailable — a forgotten convenience, nothing more
  }
};

/** The previous queries for `dataset`, most recent first. */
export const readSearchQueries = (dataset: string): string[] => {
  try {
    const queries = read()[dataset];
    return Array.isArray(queries)
      ? queries.filter((q): q is string => typeof q === "string")
      : [];
  } catch {
    return [];
  }
};

/**
 * `queries` with `query` moved to the front (deduped, case-sensitive) and the
 * list capped. Pure — the storage wrapper above is the only browser touch.
 */
export const rememberQuery = (
  queries: readonly string[],
  query: string,
): string[] =>
  [query, ...queries.filter((q) => q !== query)].slice(0, QUERY_HISTORY_CAP);
