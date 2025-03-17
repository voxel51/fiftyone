import { createCache } from "@fiftyone/looker";
import { useEffect } from "react";
import { useMemoOne } from "use-memo-one";

export default function useLookerCache({
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
  const cache = useMemoOne(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    return createCache({
      maxHiddenItems,
      maxHiddenItemsSizeBytes,
      onDispose,
      onSet,
    });
  }, [maxHiddenItems, maxHiddenItemsSizeBytes, onDispose, onSet, reset]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  useEffect(() => {
    const listener = () => cache.empty();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, [cache]);

  return cache;
}
