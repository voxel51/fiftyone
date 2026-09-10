/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The `keyframe`/`instance` fields a freshly drawn track anchor is missing:
 * the drawn frame is the track's first keyframe, and track rows group by
 * `instance`, so an anchor born without one is excluded from its own track.
 * Index-addressed (`track-<index>`) tracks are skipped; their identity is the
 * persisted `index`.
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
