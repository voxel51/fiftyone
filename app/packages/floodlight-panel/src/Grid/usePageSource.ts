import { useLayoutEffect } from "react";
import { createPageSource } from "../host/pageSource";
import usePanelMemo from "./panelMemory";

/**
 * The panel's pages while `key` holds, so a remount (returning from a
 * sample's page) lays out the pages it left from memory. Fetches go through
 * the latest `fetch`, whose closure belongs to the current mount. A new
 * `refresh` drops the pages, including one that happened while the grid was
 * not mounted.
 */
export default function usePageSource<P>(
  key: string,
  refresh: unknown,
  fetch: (key: number) => Promise<P>,
  ids: (page: P) => Iterable<string>,
) {
  const held = usePanelMemo("pageSource", key, () => {
    const latest = { fetch };
    return {
      latest,
      refresh,
      source: createPageSource((page: number) => latest.fetch(page), { ids }),
    };
  });
  held.latest.fetch = fetch;

  // before the host's first build, which reads the pages
  useLayoutEffect(() => {
    if (held.refresh === refresh) return;
    held.refresh = refresh;
    held.source.invalidate();
  }, [held, refresh]);

  return held.source;
}
