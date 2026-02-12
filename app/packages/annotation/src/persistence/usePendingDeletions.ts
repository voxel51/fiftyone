import { atom, getDefaultStore } from "jotai";
import type { AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";
import type { JSONDeltas } from "@fiftyone/core";
import { useGetLabelDelta } from "./useGetLabelDelta";
import type { LabelProxy } from "../deltas";

type PendingDeletion = {
  type: AnnotationLabel["type"];
  data: AnnotationLabel["data"];
  path: string;
};

const pendingDeletionsAtom = atom<PendingDeletion[]>([]);
const STORE = getDefaultStore();

const buildDeletionLabel = (deletion: PendingDeletion): LabelProxy => ({
  type: deletion.type as "Detection" | "Classification",
  data: deletion.data,
  path: deletion.path,
});

/**
 * Hook that manages pending label deletions triggered by canvas undo.
 *
 * Labels auto-saved to the database that are later removed via undo still need
 * a deletion patch sent to the server.  This hook provides both sides of that
 * workflow:
 *
 * - **`queueDeletion`** — call when a label is removed via undo to mark it for
 *   deletion on the next persistence cycle.
 * - **`consumeDeletionDeltas`** — call from a delta supplier to generate the
 *   deletion patches and clear the queue.
 */
export const usePendingDeletions = () => {
  const getDeleteDelta = useGetLabelDelta(buildDeletionLabel, {
    opType: "delete",
  });

  const queueDeletion = useCallback((label: AnnotationLabel) => {
    STORE.set(pendingDeletionsAtom, (prev) => [
      ...prev,
      {
        type: label.type,
        data: label.data,
        path: label.path,
      },
    ]);
  }, []);

  const consumeDeletionDeltas = useCallback(
    (currentOverlayIds: Set<string>): JSONDeltas => {
      const deletions = STORE.get(pendingDeletionsAtom);
      if (deletions.length === 0) return [];

      const deltas: JSONDeltas = [];
      for (const deletion of deletions) {
        // Skip if the overlay was re-added to the scene (e.g. via redo).
        if (!currentOverlayIds.has(deletion.data._id)) {
          deltas.push(...getDeleteDelta(deletion, deletion.path));
        }
      }

      STORE.set(pendingDeletionsAtom, []);
      return deltas;
    },
    [getDeleteDelta]
  );

  return { queueDeletion, consumeDeletionDeltas };
};
