/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

/**
 * A published "active stream" handle: a module-private jotai atom paired with
 * a reader hook and a publisher hook. The video surface registers a single
 * live instance of each stream (frame labels, imavid images) so external code
 * can read the active one, while only the stream's registrar can publish it.
 *
 * The atom is **closure-private** — it can't be imported even by accident,
 * Call once at module scope and re-export the returned hooks under
 * stream-specific names.
 *
 * @example
 * const { useStream, usePublishStream } =
 *   createStreamHandle<VideoFrameLabelsStream>();
 * export const useFrameLabelsStream = useStream;
 * export const usePublishFrameLabelsStream = usePublishStream;
 */
export function createStreamHandle<T>(): {
  /** Reads the active stream, or `null` when none is published. */
  useStream: () => T | null;
  /**
   * Publishes `stream` for the lifetime of the calling component, clearing
   * it on unmount. Intended for the stream's registrar; nothing else should
   * publish.
   */
  usePublishStream: (stream: T | null) => void;
} {
  // jotai `atom<T>(null)` with strictNullChecks off infers a read-only `Atom`
  // (null satisfies the first `read`-fn overload), so cast to the writable
  // primitive it actually is.
  const streamAtom = atom<T | null>(null) as PrimitiveAtom<T | null>;

  const useStream = (): T | null => useAtomValue(streamAtom);

  const usePublishStream = (stream: T | null): void => {
    const setStream = useSetAtom(streamAtom);

    useEffect(() => {
      setStream(stream);

      return () => setStream(null);
    }, [setStream, stream]);
  };

  return { useStream, usePublishStream };
}
