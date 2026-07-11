import { createStreamHandle } from "./createStreamHandle";
import type { FrameBitmapStream } from "./frameBitmapStream";

// Typed to the base so either backing stream (the `/frames` ImaVidImageStream
// or the WebCodecs NativeVideoFrameStream) can be published/consumed — the tile
// and SAM2 consumers only touch base methods (getValue/warmup/fps/totalFrames).
const { useStream, usePublishStream } = createStreamHandle<FrameBitmapStream>();

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
export const useImaVidImageStream = useStream;

/**
 * Publishes `stream` as the active ImaVid image stream for the lifetime of
 * the calling component, clearing on unmount. Intended for the imavid image
 * registrar; nothing else should be publishing.
 */
export const usePublishImaVidImageStream = usePublishStream;
