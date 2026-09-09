import { useMemo, useRef } from "react";
import {
  atom,
  useAtomValue,
  useSetAtom,
  useStore,
  type PrimitiveAtom,
} from "jotai";

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

/** Stable identity for a scene entity hovered in either 2D or 3D. */
export interface HoveredSceneAnnotationEcho {
  readonly entityId: string;
  readonly kind: "scene-annotation";
  readonly stream: string;
}

/** Hover payload echoed between episode panes. */
export type HoverEcho = HoveredPointEcho | HoveredSceneAnnotationEcho;

/** Modal-local atom containing the object currently echoed across panes. */
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

/** One hover relinquished by an owned publisher. */
export interface RetiredHoverEcho<Key> {
  /** Whether this hover was still current and therefore cleared the atom. */
  readonly cleared: boolean;
  readonly hover: HoverEcho;
  readonly key: Key;
}

/** Identity-safe ownership operations for hover producers. */
export interface OwnedHoverEchoPublisher<Key> {
  /** Publishes and records the hover owned under `key`. */
  publish(key: Key, hover: HoverEcho): void;
  /** Relinquishes every hover owned by this producer. */
  disownAll(): readonly RetiredHoverEcho<Key>[];
  /** Relinquishes one hover without clearing a newer producer's value. */
  retract(key: Key): RetiredHoverEcho<Key> | null;
  /** Relinquishes the owned hovers selected by `shouldRetire`. */
  retire(
    shouldRetire: (key: Key, hover: HoverEcho) => boolean,
  ): readonly RetiredHoverEcho<Key>[];
}

/** Owns hover publications in a ref map and resets the atom by identity. */
export function useOwnedHoverEchoPublisher<
  Key,
>(): OwnedHoverEchoPublisher<Key> {
  const store = useStore();
  const ownedRef = useRef(new Map<Key, HoverEcho>());

  return useMemo(() => {
    const retract = (key: Key): RetiredHoverEcho<Key> | null => {
      const hover = ownedRef.current.get(key);
      if (!hover) return null;
      ownedRef.current.delete(key);
      let cleared = false;
      store.set(hoverEchoAtom, (current) => {
        if (current !== hover) return current;
        cleared = true;
        return null;
      });
      return { cleared, hover, key };
    };

    const retire = (
      shouldRetire: (key: Key, hover: HoverEcho) => boolean,
    ): readonly RetiredHoverEcho<Key>[] => {
      const retired: RetiredHoverEcho<Key>[] = [];
      for (const [key, hover] of ownedRef.current) {
        if (!shouldRetire(key, hover)) continue;
        const result = retract(key);
        if (result) retired.push(result);
      }
      return retired;
    };

    return {
      publish: (key: Key, hover: HoverEcho) => {
        ownedRef.current.set(key, hover);
        store.set(hoverEchoAtom, hover);
      },
      disownAll: () => retire(() => true),
      retract,
      retire,
    };
  }, [store]);
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

/** Whether a shared hover identifies this exact scene entity. */
export function hoverMatchesSceneEntity(
  hover: HoverEcho | null,
  stream: string,
  entityId: string,
): hover is HoveredSceneAnnotationEcho {
  return (
    hover?.kind === "scene-annotation" &&
    hover.stream === stream &&
    hover.entityId === entityId
  );
}
