import { atom, useAtomValue, useStore } from "jotai";
import React, { useEffect } from "react";
import type { SceneEntityVisualization } from "../../decoders";

/**
 * Cross-tile object selection for the episode modal. One object at a time,
 * selected by clicking a 3D scene annotation or a 2D image annotation.
 * The inspector sidebar renders the payload; the picked object itself
 * highlights wherever its identity reaches (3D entity id, 2D shape key).
 *
 * `scope` widens the highlight: a plain click selects exactly one
 * instance; a SHIFT-click selects "everything with this label" — the
 * in-scene siblings and the best-effort cross-tile echo (2D annotations
 * carry no object ids, so label + stream matching is the only
 * cross-modal link the data offers).
 *
 * Lives in the tiling shell's per-instance Jotai store, like the tile
 * source bindings.
 */

export type EpisodeSelectionScope = "instance" | "label";

export interface EpisodeSelectedSceneObject {
  readonly kind: "scene-annotation";
  readonly scope: EpisodeSelectionScope;
  readonly stream: string;
  readonly entityId: string;
  readonly frameId?: string;
  readonly label: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface EpisodeSelectedImageObject {
  readonly kind: "image-annotation";
  readonly scope: EpisodeSelectionScope;
  readonly stream: string;
  /** Overlay primitive key — exact-shape highlight in the owning view. */
  readonly key: string;
  readonly label: string | null;
  readonly primitiveKind: string;
  readonly primitiveIndex: number;
  readonly data?: unknown;
}

export type EpisodeSelectedObject =
  | EpisodeSelectedSceneObject
  | EpisodeSelectedImageObject;

export const episodeSelectedObjectAtom = atom<EpisodeSelectedObject | null>(
  null,
);

export function useEpisodeSelectedObject(): EpisodeSelectedObject | null {
  return useAtomValue(episodeSelectedObjectAtom);
}

// Metadata keys producers commonly use for an object's class/label, in
// preference order. The entity id is the fallback — some datasets pack
// the class into it.
const ENTITY_LABEL_METADATA_KEYS = ["label", "category", "class", "name"];

/** Best-effort display label for a 3D scene entity. */
export function episodeEntityLabel(
  entity: Pick<SceneEntityVisualization, "id" | "metadata">,
): string | null {
  for (const key of ENTITY_LABEL_METADATA_KEYS) {
    const value = entity.metadata[key];
    if (value) return value;
  }
  return entity.id || null;
}

/** Whether `selected` is exactly this scene entity. */
export function isEpisodeSceneEntitySelected(
  selected: EpisodeSelectedObject | null,
  stream: string,
  entityId: string,
): boolean {
  return (
    selected?.kind === "scene-annotation" &&
    selected.stream === stream &&
    selected.entityId === entityId
  );
}

/**
 * Whether an object with `label` should echo the current selection —
 * only for label-scoped (SHIFT-click) selections; a plain click keeps
 * the highlight on the single picked instance.
 */
export function isEpisodeLabelEcho(
  selected: EpisodeSelectedObject | null,
  label: string | null,
): boolean {
  return (
    selected !== null &&
    selected.scope === "label" &&
    label !== null &&
    selected.label === label
  );
}

/**
 * Clears the selection on Escape. Registered in the capture phase so
 * the first Escape dismisses the selection instead of (e.g.) closing
 * the modal; with nothing selected the event passes through untouched.
 */
export function useEpisodeClearSelectionOnEscape(): void {
  const store = useStore();
  // This effect binds a capture-phase Escape listener for the lifetime
  // of the modal shell.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (store.get(episodeSelectedObjectAtom) === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      store.set(episodeSelectedObjectAtom, null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [store]);
}

/**
 * Non-visual mount point for the selection hotkeys — render once inside
 * the playback shell (any descendant of its providers).
 */
export const EpisodeSelectionHotkeys: React.FC = () => {
  useEpisodeClearSelectionOnEscape();
  return null;
};
