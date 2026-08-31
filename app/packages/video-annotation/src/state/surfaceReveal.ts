import { atom, useAtomValue, useSetAtom } from "jotai";

/**
 * The surface's coordinated reveal: media tile and timeline flip visible
 * together, in the same commit, once BOTH are ready —
 *
 * - `sceneRevealed` — the tile's Lighter scene settled its initial viewport
 *   on-canvas (`lighter:viewport-init-complete`); published by `TileBody`.
 * - `timelineLoaded` — schemas + frame-track index resolved, so real rows can
 *   render; published by `FrameLabelsTracks` (and by the surface directly in
 *   synthetic labels mode, which has no loading phase).
 *
 * Until then the surface overlays media + timeline with one opaque loading
 * cover — everything underneath still mounts and lays out, so streams
 * register, tracks land, and the timeline's pin-bootstrap re-key happens
 * invisibly instead of as on-screen flicker and layout shift.
 *
 * Plain module-level atoms (not a Context-scoped store) for the same reason
 * as `annotationStatus`: writers and readers mounted across the surface
 * must resolve to the same modal-default jotai store. Each writer resets its
 * flag on unmount, so a sample change re-hides until the new sample settles.
 */
const sceneRevealedAtom = atom(false);
const timelineLoadedAtom = atom(false);

const surfaceRevealedAtom = atom(
  (get) => get(sceneRevealedAtom) && get(timelineLoadedAtom),
);

/** Writer for the scene half. Internal to `TileBody`. Resets on unmount so a
 * sample change re-covers until the new sample settles. */
export const useSetSceneRevealed = () => useSetAtom(sceneRevealedAtom);

/** Writer for the timeline half. Internal to `FrameLabelsTracks` and the
 * surface's synthetic-mode shortcut. */
export const useSetTimelineLoaded = () => useSetAtom(timelineLoadedAtom);

/** Whether the whole surface (media + timeline) is safe to show. */
export const useSurfaceRevealed = () => useAtomValue(surfaceRevealedAtom);
