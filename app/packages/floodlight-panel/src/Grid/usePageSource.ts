import { useLayoutEffect } from "react";
import { createPageSource } from "../host/pageSource";
import usePanelMemo from "./panelMemory";

/**
 * The panel's pages while `key` holds, so a remount (returning from a
 * sample's page) lays out the pages it left from memory. Fetches go through
 * the latest `fetch`, whose closure belongs to the current mount. A new
 * `refresh` drops the pages, including one that happened while the grid was
 * not mounted. `onEvict` hears each page the bounded source lets go. A new
 * `key` aborts the old pages' warms.
 */
export default function usePageSource<P>(
  key: string,
  refresh: unknown,
  fetch: (key: number, signal: AbortSignal) => Promise<P>,
  ids: (page: P) => Iterable<string>,
  onEvict: (key: number, page: P) => void,
) {
  const held = usePanelMemo(
    "pageSource",
    key,
    () => {
      const latest = { fetch, onEvict };
      return {
        latest,
        refresh,
        source: createPageSource(
          (page: number, signal: AbortSignal) => latest.fetch(page, signal),
          { ids, onEvict: (page, value) => latest.onEvict(page, value) },
        ),
      };
    },
    (held) => held.source.dispose(),
  );
  held.latest.fetch = fetch;
  held.latest.onEvict = onEvict;

  // before the host's first build, which reads the pages
  useLayoutEffect(() => {
    if (held.refresh === refresh) return;
    held.refresh = refresh;
    held.source.invalidate();
  }, [held, refresh]);

  return held.source;
}
