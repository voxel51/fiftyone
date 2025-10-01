/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Interface for overlays that can be selected.
 */
export interface Selectable {
  /**
   * Gets the unique identifier for this selectable overlay.
   */
  readonly id: string;

  /**
   * Checks if this overlay is currently selected.
   * @returns True if the overlay is selected.
   */
  isSelected(): boolean;

  /**
   * Sets the selection state of this overlay.
   * @param selected - Whether the overlay should be selected.
   */
  setSelected(selected: boolean): void;

  /**
   * Toggles the selection state of this overlay.
   * @returns The new selection state.
   */
  toggleSelected(): boolean;

  /**
   * Gets the selection priority for this overlay.
   * Higher priority overlays are preferred when multiple overlays
   * could be selected at the same point.
   * @returns The selection priority (higher = more priority).
   */
  getSelectionPriority(): number;
}
