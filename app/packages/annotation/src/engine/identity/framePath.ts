/**
 * The per-frame label-field path convention.
 *
 * The annotation schema, the engine, the form, and the canvas all address a
 * video sample's per-frame label field by its full dataset path,
 * `frames.<field>` — one shared namespace. The only place that needs the
 * relative `<field>` is the {@link FrameStore} when it addresses a field
 * *inside* a per-frame document (a frame doc stores `detections`, not
 * `frames.detections`); `toSchemaField` is that internal mapping. Sample-level
 * fields carry no prefix and pass through unchanged.
 */

export const FRAMES_PREFIX = "frames.";

/** Frame engine path (`frames.detections`) → in-frame-doc field (`detections`); identity for sample-level paths. */
export const toSchemaField = (enginePath: string): string =>
  enginePath.startsWith(FRAMES_PREFIX)
    ? enginePath.slice(FRAMES_PREFIX.length)
    : enginePath;
