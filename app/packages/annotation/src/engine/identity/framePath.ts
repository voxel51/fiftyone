/**
 * The per-frame label-field path convention — the single seam between the two
 * namespaces video annotation spans:
 *
 * - the ENGINE namespace addresses a video sample's per-frame label fields by
 *   their full dataset path, `frames.<field>` (a `FrameStore` is keyed this
 *   way; presence/interaction/persistence all speak it);
 * - the annotation-SCHEMA namespace (what `createNew`, the sidebar's active
 *   field set, the field selector operate on) names the same field by its
 *   relative `<field>`.
 *
 * Every core↔engine crossing for a video frame field must translate here
 * rather than re-deriving the prefix inline, so the convention has one home.
 * Sample-level fields (temporal detections, image labels) carry no prefix and
 * round-trip unchanged through both directions.
 *
 * This is the explicit form of a translation the video integration currently
 * does implicitly in several hooks; it is the thing to delete once the
 * annotation schema exposes real `frames.*` paths directly (see the
 * video-on-annotation-engine end-state plan).
 */

export const FRAMES_PREFIX = "frames.";

/** Relative field (`detections`) → engine path (`frames.detections`); idempotent. */
export const toFrameEnginePath = (relativeField: string): string =>
  relativeField.startsWith(FRAMES_PREFIX)
    ? relativeField
    : `${FRAMES_PREFIX}${relativeField}`;

/** Engine path (`frames.detections`) → schema field (`detections`); identity for sample-level paths. */
export const toSchemaField = (enginePath: string): string =>
  enginePath.startsWith(FRAMES_PREFIX)
    ? enginePath.slice(FRAMES_PREFIX.length)
    : enginePath;
