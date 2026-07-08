import type { Track } from "../../lib/tracks/TrackProvider";

/**
 * Split `tracks` into `pinned` and `unpinned` buckets, preserving source-array
 * order within each bucket. A track with a `parentId` is a sub-row and inherits
 * its parent's pin state: if the parent is pinned the sub-row goes into
 * `pinned`, otherwise into `unpinned`. This keeps parent + children contiguous
 * regardless of which subset the user has pinned — without it, pinning only
 * "person 3" would yank person 3 into the pinned bucket while leaving its
 * `occluded` sub-row stranded above person 1 and person 2 in the unpinned
 * bucket (the bug this helper fixes).
 *
 * Sub-rows are not in `pinnedIds` themselves — they aren't independently
 * pinnable. A sub-row whose `parentId` is missing from `tracks` (e.g. the
 * parent was filtered out earlier in the pipeline) falls back to its own id
 * for pin lookup; in practice the producer keeps parent + children together.
 */
export function partitionTracksByPin(
  tracks: readonly Track[],
  pinnedIds: ReadonlySet<string>,
): { pinned: Track[]; unpinned: Track[] } {
  const pinned: Track[] = [];
  const unpinned: Track[] = [];
  for (const t of tracks) {
    const ownerId = t.parentId ?? t.id;
    if (pinnedIds.has(ownerId)) pinned.push(t);
    else unpinned.push(t);
  }
  return { pinned, unpinned };
}
