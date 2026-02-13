import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import type { AnnotationLabel } from "@fiftyone/state";
import type { WritableAtom } from "jotai";
import { getDefaultStore } from "jotai";
import { isEqual } from "lodash";
import { useEffect, useRef } from "react";
import { useWorkingDoc } from "./store";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "./types";
import { currentEditingCuboidAtom } from "./useSetEditingToNewCuboid";
import { currentEditingPolylineAtom } from "./useSetEditingToNewPolyline";

type ClearedEditingState = {
  labelId: string;
  editingAtomRef: WritableAtom<AnnotationLabel | null, [any], void>;
  editingData: AnnotationLabel;
};

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

  // Track the last synced working label to prevent unnecessary updates
  const lastSyncedWorkingLabelRef = useRef<
    ReconciledDetection3D | ReconciledPolyline3D | null
  >(null);

  // Store cleared editing state for potential restoration on redo
  const clearedEditingRef = useRef<ClearedEditingState | null>(null);

  useEffect(() => {
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
        store.set(editingAtomRef, restoredEditing);
        store.set(editingAtom, editingAtomRef);
        clearedEditingRef.current = null;
        lastSyncedWorkingLabelRef.current = workingLabel;
        return;
      }
    }

    const editingValue = store.get(editingAtom);

    // Only sync for 3D editing atoms
    if (!editingValue || typeof editingValue === "string") return;
    if (
      editingValue !== currentEditingCuboidAtom &&
      editingValue !== currentEditingPolylineAtom
    ) {
      return;
    }

    const currentEditing = store.get(editingValue);
    if (!currentEditing?.data?._id) return;

    const labelId = currentEditing.data._id;

    // If the label was deleted (like via undo of creation), clear editing state
    if (workingDoc.deletedIds.has(labelId)) {
      // Store for potential redo restoration
      clearedEditingRef.current = {
        labelId,
        editingAtomRef: editingValue,
        editingData: currentEditing,
      };
      store.set(editingValue, null);
      store.set(editingAtom, null);
      lastSyncedWorkingLabelRef.current = null;
      return;
    }

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
  }, [workingDoc, store]);
}
