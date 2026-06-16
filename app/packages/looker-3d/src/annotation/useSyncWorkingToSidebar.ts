import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
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

  // Track the last synced working label to prevent unnecessary updates
  const lastSyncedWorkingLabelRef = useRef<
    ReconciledDetection3D | ReconciledPolyline3D | null
  >(null);

  useEffect(() => {
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
