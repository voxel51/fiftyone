import { createCache } from "@fiftyone/looker";
import { useEffect, useState } from "react";
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
  const [counter, increment] = useState(0);

  useEffect(() => {
    const listener = () => {
      increment((count) => count + 1);
    };
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  const cache = useMemoOne(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    counter;
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    return createCache({
      maxHiddenItems,
      maxHiddenItemsSizeBytes,
      onDispose,
      onSet,
    });
  }, [
    counter,
    maxHiddenItems,
    maxHiddenItemsSizeBytes,
    onDispose,
    onSet,
    reset,
  ]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  return cache;
}
