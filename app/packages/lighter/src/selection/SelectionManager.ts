/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getEventBus } from "@fiftyone/events";
import type { LighterEventGroup } from "../events";
import type { Selectable } from "./Selectable";

/**
 * Options for selection operations.
 */
export interface SelectionOptions {
  /**
   * An optional pointer event that triggered the selection.
   */
  event?: PointerEvent;

  /**
   * Flag for ignoring side effects
   */
  ignoreSideEffects?: boolean;
}

/**
 * Manages selection state for overlays in a scene.
 */
export class SelectionManager {
  private readonly multipleSelection = false;

  private selectedOverlays = new Set<string>();
  private selectableOverlays = new Map<string, Selectable>();
  private readonly eventBus = getEventBus<LighterEventGroup>();

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
   * @param options - Optional selection options.
   */
  select(id: string, options: SelectionOptions = {}): void {
    const { event, ignoreSideEffects = false } = options;
    const overlay = this.selectableOverlays.get(id);

    if (!overlay) return;

    const wasSelected = this.selectedOverlays.has(id);

    if (wasSelected) return;

    if (!this.multipleSelection && this.selectedOverlays.size > 0) {
      const existingSelectedOverlayId = this.selectedOverlays
        .values()
        .next().value;

      if (existingSelectedOverlayId) {
        this.deselect(existingSelectedOverlayId);
      }
    }

    this.selectedOverlays.add(id);
    overlay.setSelected(true);

    this.eventBus.dispatch("lighter:overlay-select", {
      id,
      // point not relevant yet
      point: { x: 0, y: 0 },
      ignoreSideEffects,
      isShiftPressed: event?.shiftKey || false,
    });

    this.emitSelectionChanged([id], []);
  }

  /**
   * Deselects an overlay.
   * @param id - The ID of the overlay to deselect.
   * @param options - Optional selection options.
   */
  deselect(id: string, options: SelectionOptions = {}): void {
    const { ignoreSideEffects = false } = options;
    const overlay = this.selectableOverlays.get(id);
    if (!overlay) return;

    const wasSelected = this.selectedOverlays.has(id);
    if (!wasSelected) return; // Not selected

    this.selectedOverlays.delete(id);
    overlay.setSelected(false);

    this.eventBus.dispatch("lighter:overlay-deselect", {
      id,
      ignoreSideEffects,
    });

    this.emitSelectionChanged([], [id]);
  }

  /**
   * Toggles the selection state of an overlay.
   * @param id - The ID of the overlay to toggle.
   * @param options - Optional selection options.
   * @returns The new selection state.
   */
  toggle(id: string, options: SelectionOptions = {}): boolean {
    const isSelected = this.selectedOverlays.has(id);
    if (isSelected) {
      this.deselect(id, options);
      return false;
    } else {
      this.select(id, options);
      return true;
    }
  }

  /**
   * Clears all selections.
   * @param options - Optional selection options.
   */
  clearSelection(options: SelectionOptions = {}): void {
    const { ignoreSideEffects = false } = options;
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

    this.eventBus.dispatch("lighter:selection-cleared", {
      ignoreSideEffects,
      previouslySelectedIds: previouslySelected,
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

    this.eventBus.dispatch("lighter:selection-changed", {
      selectedIds,
      deselectedIds,
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
