import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";

/**
 * Cross-pane hover echo for the episode modal: whatever the pointer is
 * dwelling on in one tile highlights everywhere else it appears — a
 * cloud point hovered in the 3D scene lights up its projected dot in
 * image tiles, and vice versa.
 *
 * The atom lives in the tiling shell's per-instance Jotai store.
 */
export interface HoveredPointEcho {
  readonly kind: "point";
  /** The point's rendered color where it was hovered, if known. */
  readonly color: readonly [number, number, number] | null;
  /** Timestamp identifying the exact point-cloud message being inspected. */
  readonly contentTimeNs: bigint;
  /** Finite scalar values safe to surface in point tooltips. */
  readonly fields: Readonly<Record<string, number>>;
  /** Coordinate frame of `position`, when declared by the point source. */
  readonly frameId?: string;
  /** Index into the source frame's decoded per-point arrays. */
  readonly pointIndex: number;
  /** Sensor-frame coordinates of the hovered point. */
  readonly position: readonly [number, number, number];
  /**
   * Interaction surface that published the hover. Projection metadata is
   * intentionally identity-only: each 3D pane owns placement into its own
   * displayed world scene.
   */
  readonly source?: {
    readonly cameraFrameId: string;
    readonly imageContentTimeNs: bigint;
    readonly imageStream: string;
    readonly kind: "image-projection";
  };
  /** Collision-safe presentation label for the point source, when known. */
  readonly sourceLabel?: string;
  /** Exact format-native point source name, when known. */
  readonly sourceName?: string;
  readonly stream: string;
  /** Frame containing `worldPosition`, present for resolved 3D picks. */
  readonly worldFrameId?: string;
  /** Picked position in the 3D panel's resolved world frame. */
  readonly worldPosition?: readonly [number, number, number];
}

/** Hover payload echoed between episode panes. */
export type HoverEcho = HoveredPointEcho;

/** Modal-local atom containing the point currently echoed across panes. */
export const hoverEchoAtom = atom<HoverEcho | null>(
  null,
) as PrimitiveAtom<HoverEcho | null>;

/** Reads the point currently echoed across episode panes. */
export function useHoverEcho(): HoverEcho | null {
  return useAtomValue(hoverEchoAtom);
}

/** Returns the setter for the modal-local hover echo. */
export function useSetHoverEcho() {
  return useSetAtom(hoverEchoAtom);
}

/**
 * Whether a point hover belongs to an exact displayed point-cloud frame.
 * Stream alone is insufficient during playback: a stale source coordinate
 * must never be reprojected with a newer frame's transform.
 */
export function hoverMatchesPointFrame(
  hover: HoverEcho | null,
  stream: string,
  contentTimeNs: bigint | undefined,
): hover is HoveredPointEcho {
  return (
    hover?.kind === "point" &&
    contentTimeNs !== undefined &&
    hover.stream === stream &&
    hover.contentTimeNs === contentTimeNs
  );
}
