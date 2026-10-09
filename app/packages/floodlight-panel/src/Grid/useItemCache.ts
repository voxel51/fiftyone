import { createCache } from "@fiftyone/looker";
import { useEffect } from "react";
import usePanelMemo from "./panelMemory";

export default function useItemCache({
  maxHiddenItems,
  maxHiddenItemsSizeBytes,
  onDispose,
  onSet,
  reset,
}: {
  maxHiddenItems: number;
  maxHiddenItemsSizeBytes: number;
  onDispose?: (key: string) => void;
  onSet?: (key: string) => void;
  reset: string;
}) {
  // the cache outlives the grid's mount, so returning from a sample's page
  // shows its tiles as they were; a new reset (or limit) replaces it
  const cache = usePanelMemo(
    "items",
    `${reset}:${maxHiddenItems}:${maxHiddenItemsSizeBytes}`,
    () =>
      createCache({
        maxHiddenItems,
        maxHiddenItemsSizeBytes,
        onDispose,
        onSet,
      }),
    (previous) => previous.delete(),
  );

  useEffect(() => {
    const listener = () => cache.empty();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, [cache]);

  return cache;
}
