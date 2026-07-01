import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { MediaBitmap } from "../types";

/** Resolves the active surface's currently-displayed media as a decoded bitmap. */
export type SegmentBitmapResolver = () => Promise<MediaBitmap | null>;

// Module-private (wrapped so the stored function isn't read as a jotai
// updater): the active surface registers a resolver; the agent context reads it.
// `atom<T>(null)` with strictNullChecks off infers a read-only `Atom` (null
// satisfies the read-fn overload), so cast to the writable primitive it is.
const resolverAtom = atom<{ resolve: SegmentBitmapResolver } | null>(
  null,
) as PrimitiveAtom<{ resolve: SegmentBitmapResolver } | null>;

/**
 * Register the current surface's decoded-bitmap resolver so the browser SAM2
 * agent can infer on an already-decoded frame instead of fetching the sample's
 * media URL. The video surface registers the active ImaVid frame; image
 * surfaces register nothing (the agent falls back to the URL path). Cleared on
 * unmount so a torn-down surface can't leak its resolver into the next one.
 */
export const useSetSegmentBitmapSource = (
  resolve: SegmentBitmapResolver | null,
): void => {
  const set = useSetAtom(resolverAtom);

  useEffect(() => {
    set(resolve ? { resolve } : null);

    return () => {
      set(null);
    };
  }, [resolve, set]);
};

/** The registered resolver, or `null` when no surface has provided one. */
export const useSegmentBitmapSource = (): SegmentBitmapResolver | null => {
  return useAtomValue(resolverAtom)?.resolve ?? null;
};
