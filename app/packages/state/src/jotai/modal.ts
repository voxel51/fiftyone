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
