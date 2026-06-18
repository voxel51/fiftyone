/**
 * Map a timeline track id back to the engine's `LabelRef.instanceId`.
 *
 * Track ids are the synthetic ids `resolveSyntheticId` mints for overlays /
 * timeline rows; the engine addresses a track by its `instance._id` (the
 * `FrameStore` resolves `instance?._id ?? _id`). The two reconcile per id form:
 *
 * - `instance-<id>` — a tracked instance; `<id>` IS the engine instanceId.
 * - a bare document `_id` — an untracked detection; the engine addresses it by
 *   that same `_id`, so the track id is already the instanceId.
 * - `track-<index>` — a legacy index-only track with no `instance._id`. Its
 *   per-frame docs carry different `_id`s, so there is no single engine
 *   instanceId for the track (O1, deferred) — returns `null`.
 */

const INSTANCE_PREFIX = "instance-";
const LEGACY_INDEX_PREFIX = "track-";

export const instanceIdFromTrackId = (trackId: string): string | null => {
  if (trackId.startsWith(INSTANCE_PREFIX)) {
    return trackId.slice(INSTANCE_PREFIX.length);
  }

  if (trackId.startsWith(LEGACY_INDEX_PREFIX)) {
    return null;
  }

  return trackId;
};
