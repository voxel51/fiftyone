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
 * - `track-<index>` — an instance-less track grouped by its persisted `index`.
 *   The engine addresses it by that same synthetic `track-<index>` id (see
 *   `addressIdOf`), so the track id is already the instanceId — pass it through.
 */

const INSTANCE_PREFIX = "instance-";

export const instanceIdFromTrackId = (trackId: string): string | null => {
  if (trackId.startsWith(INSTANCE_PREFIX)) {
    return trackId.slice(INSTANCE_PREFIX.length);
  }

  return trackId;
};
