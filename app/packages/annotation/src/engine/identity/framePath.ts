/**
 * The per-frame label-field path convention: everything addresses a frame
 * field by its full `frames.<field>` dataset path. Only the {@link FrameStore}
 * needs the relative `<field>` inside a frame document, via `toSchemaField`.
 */

export const FRAMES_PREFIX = "frames.";

/** Frame engine path (`frames.detections`) → in-frame-doc field (`detections`); identity for sample-level paths. */
export const toSchemaField = (enginePath: string): string =>
  enginePath.startsWith(FRAMES_PREFIX)
    ? enginePath.slice(FRAMES_PREFIX.length)
    : enginePath;

/**
 * Whether `path` addresses per-frame labels. A real video's frame labels live
 * under `frames.*`; in an image dynamic group video each frame is a sample, so
 * its bare paths are the frame-scoped ones.
 */
export const isFrameScopedPath = (
  path: string,
  isImageDynamicGroupVideo: boolean,
): boolean =>
  isImageDynamicGroupVideo
    ? !path.startsWith(FRAMES_PREFIX)
    : path.startsWith(FRAMES_PREFIX);
