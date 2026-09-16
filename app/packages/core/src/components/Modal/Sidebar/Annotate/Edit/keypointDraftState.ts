/**
 * Session-scoped registry of keypoint creation drafts that have been
 * finalized (committed via `lighter:overlay-establish`).
 *
 * Keypoint creation is atomic: a draft places its nodes silently and persists
 * once, at completion. Until then it exists only in the scene, so exit paths
 * (see `hasDrawnContent` in useExit.ts) must discard an unfinalized draft —
 * whatever was placed — rather than keep it. This module is the one bit of
 * shared state that distinguishes "finalized, keep" from "abandoned, discard";
 * it lives apart from useKeypointMode to avoid an import cycle with useExit.
 *
 * Entries are overlay ids (=== label `_id`s). The set only grows within a
 * session, but ids are ~24 bytes and finalized drafts are user actions —
 * bounded in practice.
 */

const finalized = new Set<string>();

/** Marks a keypoint draft as finalized (committed). */
export const markKeypointDraftFinalized = (overlayId: string): void => {
  finalized.add(overlayId);
};

/** Whether a keypoint draft was finalized (committed) this session. */
export const isKeypointDraftFinalized = (overlayId: string): boolean =>
  finalized.has(overlayId);
