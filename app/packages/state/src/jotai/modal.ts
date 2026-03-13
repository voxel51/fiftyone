import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { ViewportState } from "@fiftyone/looker";
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
 * Extends the base ViewportState with a `sampleId` so stale state from 
 * a previous sample is never mistakenly applied when switching between 
 * modes (EXPLORE vs ANNOTATE).
 */
export interface ModalViewportState extends ViewportState {
  sampleId: string;
}

/**
 * The zoom and pan state of the modal viewer at the moment the user last
 * switched modes (EXPLORE vs ANNOTATE).
 *
 * @internal Do not import this atom directly. Use `useSaveModalViewport`,
 * `useModalViewport`, or `modalBridge.getModalViewport()` instead.
 */
export const __unsafeModalViewportAtom = atom<ModalViewportState | null>(null);
