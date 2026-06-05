import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { ImaVidImageStream } from "./ImaVidImageStream";

/**
 * Active ImaVid image stream (decoded per-frame bitmaps). Published so
 * consumers outside the tile — e.g. SAM2 video propagation, which needs to
 * pull arbitrary frame bitmaps by index — can reach the stream instance to
 * call `warmup` / `getValue`.
 *
 * Mirrors {@link useFrameLabelsStream}: publication goes through
 * {@link usePublishImaVidImageStream} so external code can't write arbitrary
 * values; `null` until the imavid registrar mounts (e.g. the native-video
 * surface, which has no image stream).
 */
const imaVidImageStreamAtom = atom<ImaVidImageStream | null>(
  null
) as PrimitiveAtom<ImaVidImageStream | null>;

export function useImaVidImageStream(): ImaVidImageStream | null {
  return useAtomValue(imaVidImageStreamAtom);
}

/**
 * Publishes `stream` as the active ImaVid image stream for the lifetime of
 * the calling component, clearing on unmount. Intended for the imavid image
 * registrar; nothing else should be publishing.
 */
export function usePublishImaVidImageStream(
  stream: ImaVidImageStream | null
): void {
  const setStream = useSetAtom(imaVidImageStreamAtom);

  useEffect(() => {
    setStream(stream);

    return () => setStream(null);
  }, [setStream, stream]);
}
