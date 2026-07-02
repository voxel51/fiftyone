import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import type { AnnotationLabel } from "@fiftyone/state";
import type { PrimitiveAtom } from "jotai";
import { getDefaultStore } from "jotai";
import { isEqual } from "lodash";
import { useEffect, useRef } from "react";
import { useWorkingDoc } from "./store";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "./types";
import { currentEditingCuboidAtom } from "./useSetEditingToNewCuboid";
import { currentEditingPolylineAtom } from "./useSetEditingToNewPolyline";

/**
 * Hook that syncs changes from the 3D working store to the sidebar
 * "editing" atoms.
 *
 * This is necessary because:
 * 1. 3D operations (drag, etc.) update the working store
 * 2. The sidebar reads from Jotai atom referenced by "editing" atom
 * 3. Without this sync, sidebar has stale data after 3D operations
 *
 * THE WORKING STORE IS AUTHORITATIVE FOR 3D, SO WE SYNC _FROM_ IT.
 */
export function useSyncWorkingToSidebar() {
  const workingDoc = useWorkingDoc();
  const store = getDefaultStore();
  const { selected, isEditingAtom } = useAnnotationContext();

  // Track the last synced working label to prevent unnecessary updates
  const lastSyncedWorkingLabelRef = useRef<
    ReconciledDetection3D | ReconciledPolyline3D | null
  >(null);

  useEffect(() => {
<<<<<<< HEAD
    // Check if we need to restore previously cleared editing state (redo case)
    if (clearedEditingRef.current) {
      const { labelId, editingAtomRef, editingData } =
        clearedEditingRef.current;
      // Label was un-deleted (redo) - restore editing state
      if (
        workingDoc.labelsById[labelId] &&
        !workingDoc.deletedIds.has(labelId)
      ) {
        // Sync latest data from working store
        const workingLabel = workingDoc.labelsById[labelId];
        const restoredEditing = {
          ...editingData,
          data: { ...editingData.data, ...workingLabel },
        } as AnnotationLabel;
        store.set(
          editingAtomRef as unknown as PrimitiveAtom<AnnotationLabel | null>,
          restoredEditing,
        );
        select(editingAtomRef as unknown as PrimitiveAtom<AnnotationLabel>);
        clearedEditingRef.current = null;
        lastSyncedWorkingLabelRef.current = workingLabel;
        return;
      }
    }

=======
>>>>>>> main
    // Only sync for 3D editing atoms
    const editingCuboid = isEditingAtom(
      currentEditingCuboidAtom as unknown as PrimitiveAtom<AnnotationLabel>,
    );
    const editingPolyline = isEditingAtom(
      currentEditingPolylineAtom as unknown as PrimitiveAtom<AnnotationLabel>,
    );
    if (!editingCuboid && !editingPolyline) return;

    const currentEditing = selected?.label;
    const labelId = currentEditing?.data._id;
    if (!labelId) return;

    // The 3D atom backing the editing pointer — narrowed by the guards above.
    const editingValue = editingCuboid
      ? currentEditingCuboidAtom
      : currentEditingPolylineAtom;

    const workingLabel = workingDoc.labelsById[labelId];
    if (!workingLabel) return;

    if (lastSyncedWorkingLabelRef.current === workingLabel) {
      return;
    }

    const currentData = currentEditing.data;

    const mergedData = { ...currentData, ...workingLabel };
    if (isEqual(currentData, mergedData)) {
      // No actual difference, but update the ref to track this working label
      lastSyncedWorkingLabelRef.current = workingLabel;
      return;
    }

    const updatedEditing = {
      ...currentEditing,
      data: { ...currentEditing.data, ...workingLabel },
      overlay: currentEditing.overlay
        ? {
            ...currentEditing.overlay,
            label: { ...currentEditing.overlay.label, ...workingLabel },
          }
        : currentEditing.overlay,
    } as typeof currentEditing;

    store.set(editingValue, updatedEditing);

    lastSyncedWorkingLabelRef.current = workingLabel;
  }, [workingDoc, selected?.label, store, isEditingAtom]);
}
