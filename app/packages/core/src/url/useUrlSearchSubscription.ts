/**
 * Router-agnostic URL search-string read + write primitive.
 *
 * Both the OSS Relay router (`@fiftyone/app/src/routing`) and the teams-app
 * Next.js router push SPA navigations through `window.history.pushState` /
 * `replaceState`. This module monkey-patches both (once) to dispatch a
 * `fo:url-changed` event whenever either of them fires, so any number of
 * features can subscribe via `useUrlSearch()` without knowing about a router.
 *
 * Mirrors the technique in
 * `app/packages/core/src/task-context/useTaskUrlParams.ts` (see
 * `feat/nav_to_task`); generalizes the event name from `task-context:nav`
 * to `fo:url-changed` so multiple URL-driven features can share one patch.
 *
 * For writes, prefer `writeUrlSearch(...)` over calling
 * `window.history.replaceState` directly — it dispatches the event so other
 * subscribers see the change.
 *
 * Caveats:
 *   - Direct `replaceState` does NOT trigger the OSS history@5 router's
 *     internal listeners (those fire on `popstate` only), so no route refetch.
 *   - Direct `replaceState` does NOT update Next.js's `router.query` either.
 *     That's fine for the schema-manager contract since nothing reads
 *     `router.query.schemaManager` after the modal closes; if a future
 *     consumer needs Next.js to see the change, it should call
 *     `next/router.replace({ shallow: true })` instead.
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
