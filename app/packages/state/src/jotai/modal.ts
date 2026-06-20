import type { ViewportState } from "@fiftyone/lighter";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { createDatasetKeyedStorage, parseDatasetNameFromUrl } from "./utils";

export const ANNOTATE = "annotate";
export const EXPLORE = "explore";

/**
 * Operating mode of the modal.
 */
export enum ModalMode {
  /**
   * Annotation mode, offering inline editing capabilities.
   */
  ANNOTATE = "annotate",

  /**
   * Exploration mode, offering read-only sample inspection.
   */
  EXPLORE = "explore",
}

export const modalMode = atomWithStorage<ModalMode>(
  "modalMode",
  ModalMode.EXPLORE,
  createDatasetKeyedStorage<ModalMode>(parseDatasetNameFromUrl)
);

/**
 * A field/label the modal should open for editing once annotation mode mounts.
 */
export interface PendingAnnotationTarget {
  readonly path?: string;
  readonly labelId?: string;
}

/**
 * Deep-link target published by the `annotate` operator so the modal can enter
 * annotation mode for a specific field/label. Lets the operator stay out of the
 * heavy in-modal annotation controller's bundle on page load.
 */
export const pendingAnnotationTargetAtom = atom<PendingAnnotationTarget | null>(
  null
);

/**
 * Extends the base ViewportState with a `sampleId` so stale state from
 * a previous sample is never mistakenly applied when switching between
 * modes (EXPLORE vs ANNOTATE).
 */
export interface ModalViewportState extends ViewportState {
  readonly sampleId: string;
}

/**
 * The zoom and pan state of the modal viewer at the moment the user last
 * switched modes (EXPLORE vs ANNOTATE).
 *
 * @internal Do not import this atom directly. Use `useSaveModalViewport`,
 * `useModalViewport`, or `modalBridge.getModalViewport()` instead.
 */
export const __unsafeModalViewportAtom = atom<ModalViewportState | null>(null);
