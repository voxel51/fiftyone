import type { AnnotationLabel } from "@fiftyone/state";
import { getDefaultStore, type PrimitiveAtom } from "jotai";
import { editingLabelAtom, pendingNewTypeAtom, savedLabel } from "./atoms";
import { current } from "./selectors";

const store = getDefaultStore();

/**
 * Non-React API for the annotation context.
 *
 * Event handlers, store-direct reads, and other non-React boundaries (e.g.
 * looker-3d's reconciliation hooks) should use this bridge instead of
 * importing the underlying atoms directly. The React layer should use
 * {@link useAnnotationContext}.
 *
 * Note on `clear()`: unlike `useAnnotationContext().clear()`, this bridge's
 * `clear()` does NOT record into last-used memory or touch
 * `activePrimitiveAtom`. It's a pure editing-state reset for non-React
 * callers that don't participate in the hook's recording flow.
 */
export const annotationContextBridge = {
  /** True if anything is being edited (a label or a pending new-type flow). */
  get isEditing(): boolean {
    return (
      store.get(editingLabelAtom) !== null ||
      store.get(pendingNewTypeAtom) !== null
    );
  },

  /** Snapshot of the currently-edited label, or null. */
  get selectedLabel(): AnnotationLabel | null {
    return store.get(current);
  },

  /**
   * The atom pointer to the currently-edited label, or null. Used by 3D
   * reconciliation to compare against specific 3D label atoms.
   */
  get editingPointer(): PrimitiveAtom<AnnotationLabel> | null {
    return store.get(editingLabelAtom);
  },

  /** Snapshot of the saved label data (the "clean" version for dirty tracking). */
  get savedData(): AnnotationLabel["data"] | null {
    return store.get(savedLabel);
  },

  /**
   * Select an existing label for editing. Sets `editingLabel`, snapshots the
   * label's data into `savedLabel`, and clears any pending new-type flow.
   */
  select(labelAtom: PrimitiveAtom<AnnotationLabel>): void {
    store.set(savedLabel, store.get(labelAtom).data);
    store.set(editingLabelAtom, labelAtom);
    store.set(pendingNewTypeAtom, null);
  },

  /** Reset all editing state. Does not record last-used. */
  clear(): void {
    store.set(editingLabelAtom, null);
    store.set(pendingNewTypeAtom, null);
    store.set(savedLabel, null);
  },

  /**
   * Update the `savedLabel` snapshot independently of which label is being
   * edited. Used where the saved/clean form differs from the live editing
   * atom's data — e.g. 3D cuboid creation, where the staged data carries
   * transform state but the saved snapshot should be the base label.
   */
  setSavedData(data: AnnotationLabel["data"] | null): void {
    store.set(savedLabel, data);
  },
};
