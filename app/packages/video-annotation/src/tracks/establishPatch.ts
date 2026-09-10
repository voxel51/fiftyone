/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The identity/keyframe fields a freshly-drawn track anchor must carry, given
 * the drawn label's current state.
 *
 * - `keyframe: true` — the drawn frame is the track's first keyframe.
 * - `instance` — the auto-extend mints `instance: {_id: <anchor instanceId>}`
 *   on every filler frame, but a drawn label is born with none; without
 *   stamping it here the persisted track excludes its own first frame (track
 *   rows group strictly by `instance`). Skipped for index-addressed tracks
 *   (`track-<index>` ids), whose identity is the persisted `index`.
 *
 * Empty object when nothing is missing.
 */
export const establishPatchFor = (
  source: { keyframe?: unknown; instance?: unknown },
  instanceId: string,
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};

  if (!source.keyframe) {
    patch.keyframe = true;
  }

  const instance = source.instance as { _id?: string } | null | undefined;
  if (!instance?._id && !instanceId.startsWith("track-")) {
    patch.instance = { _id: instanceId, _cls: "Instance" };
  }

  return patch;
};
