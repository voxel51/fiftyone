import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";

/**
 * Cross-pane hover echo for the episode modal: whatever the pointer is
 * dwelling on in one tile highlights everywhere else it appears — a
 * cloud point hovered in the 3D scene lights up its projected dot in
 * image tiles, and vice versa.
 *
 * The atom lives in the tiling shell's per-instance Jotai store.
 */
export interface EpisodeHoveredPointEcho {
  readonly kind: "point";
  /** The point's rendered color where it was hovered, if known. */
  readonly color: readonly [number, number, number] | null;
  /** Index into the source frame's decoded per-point arrays. */
  readonly pointIndex: number;
  /** Sensor-frame coordinates of the hovered point. */
  readonly position: readonly [number, number, number];
  readonly stream: string;
}

/** Hover payload echoed between episode panes. */
export type EpisodeHoverEcho = EpisodeHoveredPointEcho;

/** Modal-local atom containing the point currently echoed across panes. */
export const episodeHoverEchoAtom = atom<EpisodeHoverEcho | null>(
  null,
) as PrimitiveAtom<EpisodeHoverEcho | null>;

/** Reads the point currently echoed across episode panes. */
export function useEpisodeHoverEcho(): EpisodeHoverEcho | null {
  return useAtomValue(episodeHoverEchoAtom);
}

/** Returns the setter for the modal-local hover echo. */
export function useSetEpisodeHoverEcho() {
  return useSetAtom(episodeHoverEchoAtom);
}
