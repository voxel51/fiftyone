import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";

/**
 * Cross-pane hover echo for the MCAP modal: whatever the pointer is
 * dwelling on in one tile highlights everywhere else it appears — a
 * cloud point hovered in the 3D scene lights up its projected dot in
 * image tiles, and vice versa.
 *
 * The atom lives in the tiling shell's per-instance Jotai store.
 */
export interface McapHoveredPointEcho {
  readonly kind: "point";
  /** The point's rendered color where it was hovered, if known. */
  readonly color: readonly [number, number, number] | null;
  /** Index into the source frame's decoded per-point arrays. */
  readonly pointIndex: number;
  /** Sensor-frame coordinates of the hovered point. */
  readonly position: readonly [number, number, number];
  readonly topic: string;
}

/** Hover payload echoed between MCAP panes. */
export type McapHoverEcho = McapHoveredPointEcho;

/** Modal-local atom containing the point currently echoed across panes. */
export const mcapHoverEchoAtom = atom<McapHoverEcho | null>(
  null,
) as PrimitiveAtom<McapHoverEcho | null>;

/** Reads the point currently echoed across MCAP panes. */
export function useMcapHoverEcho(): McapHoverEcho | null {
  return useAtomValue(mcapHoverEchoAtom);
}

/** Returns the setter for the modal-local hover echo. */
export function useSetMcapHoverEcho() {
  return useSetAtom(mcapHoverEchoAtom);
}
