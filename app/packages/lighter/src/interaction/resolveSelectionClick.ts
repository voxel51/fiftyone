/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** What a pointer-down should do to the selection. */
export type SelectionClickAction = "toggle" | "select" | "none";

export interface SelectionClickInput {
  /** Whether a selectable overlay is under the pointer at all. */
  isSelectableOverlay: boolean;
  /** Whether that overlay is already selected. */
  isSelected: boolean;
  /** Whether a draw tool is active over an overlay it should treat as canvas. */
  isDrawingOver: boolean;
  /** Whether this scene can hold several selected overlays at once. */
  multipleSelection: boolean;
}

/**
 * Decide what a click does to the selection.
 *
 * Split out of `InteractionManager` so the rule is stateless and testable —
 * the manager around it needs a canvas, a renderer and a hit test before it
 * can answer anything.
 *
 * A multi-select scene TOGGLES, and acts on an already-selected overlay too:
 * with several selected at once, clicking one again is the only gesture that
 * takes it back out. A single-select scene ignores a click on the overlay it
 * has already selected, because there that click is the start of a drag on it
 * and deselecting would strand the gesture.
 */
export const resolveSelectionClick = ({
  isSelectableOverlay,
  isSelected,
  isDrawingOver,
  multipleSelection,
}: SelectionClickInput): SelectionClickAction => {
  if (!isSelectableOverlay || isDrawingOver) {
    return "none";
  }

  if (multipleSelection) {
    return "toggle";
  }

  return isSelected ? "none" : "select";
};
