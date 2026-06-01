/**
 * Router-agnostic URL search-string read + write primitive.
 *
 * Monkey-patches `window.history.pushState` / `replaceState` once to
 * dispatch a `fo:url-changed` event, so subscribers (via `useUrlSearch`)
 * pick up SPA navigations made through any router. Prefer
 * `writeUrlSearch(...)` over calling `replaceState` directly so the event
 * fires for subscribers.
 */

import { useEffect, useState } from "react";

export const URL_CHANGED_EVENT = "fo:url-changed";

const PATCH_MARKER = "__foHistoryPatched__";

// Exported for tests; idempotent.
export const patchHistoryOnce = () => {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[PATCH_MARKER]) return;
  w[PATCH_MARKER] = true;

  const dispatch = () => window.dispatchEvent(new Event(URL_CHANGED_EVENT));

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args: Parameters<typeof origPush>) => {
    origPush(...args);
    dispatch();
  };
  window.history.replaceState = (...args: Parameters<typeof origReplace>) => {
    origReplace(...args);
    dispatch();
  };
};

/**
 * Subscribe to the current `window.location.search`. Re-renders on:
 *   - `popstate` (browser back/forward)
 *   - any `pushState`/`replaceState` call from any router
 *   - explicit `writeUrlSearch(...)` calls
 *
 * Returns the raw search string including the leading `?` (or `""`).
 */
export const useUrlSearch = (): string => {
  const [search, setSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.location.search
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    patchHistoryOnce();

    const update = () => setSearch(window.location.search);
    window.addEventListener("popstate", update);
    window.addEventListener(URL_CHANGED_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(URL_CHANGED_EVENT, update);
    };
  }, []);

  return search;
};

/**
 * Update the URL's search string via `history.replaceState`, preserving
 * pathname + hash, and notify subscribers via `URL_CHANGED_EVENT`.
 *
 * Pass the bare query string (with or without leading `?`). Empty string
 * clears the query.
 */
export const writeUrlSearch = (nextSearch: string): void => {
  if (typeof window === "undefined") return;
  // Defensive: in practice `writeUrlSearch` is only called from inside hooks
  // that mount `useUrlSearch` (which installs the patch). But if a future
  // caller writes before any subscriber mounts, the patched `replaceState`
  // is what guarantees the `URL_CHANGED_EVENT` dispatch. Idempotent.
  patchHistoryOnce();
  const trimmed = nextSearch.replace(/^\?/, "");
  const qs = trimmed ? `?${trimmed}` : "";
  const next = `${window.location.pathname}${qs}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next);
};
