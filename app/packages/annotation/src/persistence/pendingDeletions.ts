import { atom } from "jotai";
import type { AnnotationLabel } from "@fiftyone/state";

/**
 * A label that was removed via undo and needs to be deleted from the database
 * on the next persistence cycle.
 */
export type PendingDeletion = {
  type: AnnotationLabel["type"];
  data: AnnotationLabel["data"];
  path: string;
};

/**
 * Labels removed via canvas undo that still need to be deleted from the
 * database.  Consumed (and cleared) by the lighter delta supplier each time
 * annotation deltas are gathered.
 */
export const pendingDeletionsAtom = atom<PendingDeletion[]>([]);
