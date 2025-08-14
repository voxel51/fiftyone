/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { Selectable } from "./Selectable";

/**
 * Manages selection state for overlays in a scene.
 */
export class SelectionManager {
  private selectedOverlays = new Set<string>();
  private selectableOverlays = new Map<string, Selectable>();

  constructor(public eventBus: EventBus) {}

  /**
   * Registers a selectable overlay with the selection manager.
   * @param overlay - The selectable overlay to register.
   */
  addSelectable(overlay: Selectable): void {
    this.selectableOverlays.set(overlay.id, overlay);
  }

  /**
   * Unregisters a selectable overlay from the selection manager.
   * @param id - The ID of the overlay to unregister.
   */
  removeSelectable(id: string): void {
    this.selectableOverlays.delete(id);
    this.deselect(id);
  }

  /**
   * Selects an overlay.
   * @param id - The ID of the overlay to select.
   * @param addToSelection - If true, adds to current selection. If false, replaces selection.
   * @param event - Optional pointer event for shift key detection.
   */
  select(id: string, addToSelection = false, event?: PointerEvent): void {
    const overlay = this.selectableOverlays.get(id);
    if (!overlay) return;

    const wasSelected = this.selectedOverlays.has(id);
    if (wasSelected) return; // Already selected

    // If not adding to selection, clear current selection first
    if (!addToSelection && this.selectedOverlays.size > 0) {
      this.clearSelection();
    }

    // Select the overlay
    this.selectedOverlays.add(id);
    overlay.setSelected(true);

    // Emit selection event
    this.eventBus.emit({
      type: LIGHTER_EVENTS.OVERLAY_SELECT,
      detail: {
        id,
        // point not relevant yet
        point: { x: 0, y: 0 },
        isShiftPressed: event?.shiftKey || false,
      },
    });

    this.emitSelectionChanged([id], []);
  }

  /**
   * Deselects an overlay.
   * @param id - The ID of the overlay to deselect.
   */
  deselect(id: string): void {
    const overlay = this.selectableOverlays.get(id);
    if (!overlay) return;

    const wasSelected = this.selectedOverlays.has(id);
    if (!wasSelected) return; // Not selected

    // Deselect the overlay
    this.selectedOverlays.delete(id);
    overlay.setSelected(false);

    // Emit deselection event
    this.eventBus.emit({
      type: LIGHTER_EVENTS.OVERLAY_DESELECT,
      detail: { id },
    });

    this.emitSelectionChanged([], [id]);
  }

  /**
   * Toggles the selection state of an overlay.
   * @param id - The ID of the overlay to toggle.
   * @param addToSelection - If true, adds to current selection when selecting.
   * @param event - Optional pointer event for shift key detection.
   * @returns The new selection state.
   */
  toggle(id: string, addToSelection = false, event?: PointerEvent): boolean {
    const isSelected = this.selectedOverlays.has(id);
    if (isSelected) {
      this.deselect(id);
      return false;
    } else {
      this.select(id, addToSelection, event);
      return true;
    }
  }

  /**
   * Clears all selections.
   */
  clearSelection(): void {
    const previouslySelected = Array.from(this.selectedOverlays);
    if (previouslySelected.length === 0) return;

    // Deselect all overlays
    for (const id of previouslySelected) {
      const overlay = this.selectableOverlays.get(id);
      if (overlay) {
        overlay.setSelected(false);
      }
    }

    this.selectedOverlays.clear();

    // Emit clear event
    this.eventBus.emit({
      type: LIGHTER_EVENTS.SELECTION_CLEARED,
      detail: { previouslySelectedIds: previouslySelected },
    });

    this.emitSelectionChanged([], previouslySelected);
  }

  /**
   * Gets the IDs of all selected overlays.
   * @returns Array of selected overlay IDs.
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedOverlays);
  }

  /**
   * Gets all selected overlays.
   * @returns Array of selected overlay objects.
   */
  getSelectedOverlays(): Selectable[] {
    return this.getSelectedIds()
      .map((id) => this.selectableOverlays.get(id))
      .filter((overlay): overlay is Selectable => overlay !== undefined);
  }

  /**
   * Checks if an overlay is selected.
   * @param id - The overlay ID to check.
   * @returns True if the overlay is selected.
   */
  isSelected(id: string): boolean {
    return this.selectedOverlays.has(id);
  }

  /**
   * Gets the number of selected overlays.
   * @returns The selection count.
   */
  getSelectionCount(): number {
    return this.selectedOverlays.size;
  }

  private emitSelectionChanged(
    selectedIds: string[],
    deselectedIds: string[]
  ): void {
    if (selectedIds.length === 0 && deselectedIds.length === 0) return;

    this.eventBus.emit({
      type: LIGHTER_EVENTS.SELECTION_CHANGED,
      detail: { selectedIds, deselectedIds },
    });
  }

  /**
   * Destroys the selection manager and cleans up resources.
   */
  destroy(): void {
    this.clearSelection();
    this.selectableOverlays.clear();
  }
}
