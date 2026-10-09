import { createPageSource } from "../host/pageSource";
import usePanelMemo from "./panelMemory";

/**
 * The panel's pages while `key` holds, so a remount (returning from a
 * sample's page) lays out the pages it left from memory. Fetches go through
 * the latest `fetch`, whose closure belongs to the current mount.
 */
export default function usePageSource<P>(
  key: string,
  fetch: (key: number) => Promise<P>,
  ids: (page: P) => Iterable<string>,
) {
  const held = usePanelMemo("pageSource", key, () => {
    const latest = { fetch };
    return {
      latest,
      source: createPageSource((page: number) => latest.fetch(page), { ids }),
    };
  });
  held.latest.fetch = fetch;
  return held.source;
}
