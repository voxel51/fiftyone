import { createCache } from "@fiftyone/looker";
import { useEffect } from "react";
import type { GridItems } from "./itemCache";

export default function useLookerCache({
  items,
  maxHiddenItems,
  maxHiddenItemsSizeBytes,
  onDispose,
  onSet,
}: {
  items: GridItems;
  maxHiddenItems: number;
  maxHiddenItemsSizeBytes: number;
  onDispose?: (key: string) => void;
  onSet?: (key: string) => void;
}) {
  // kept with the grid's items, which are disposed when the grid resets, not
  // when it unmounts
  items.lookers ??= createCache({
    maxHiddenItems,
    maxHiddenItemsSizeBytes,
    onDispose,
    onSet,
  });
  const cache = items.lookers;

  useEffect(() => {
    const listener = () => cache.empty();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, [cache]);

  return cache;
}
