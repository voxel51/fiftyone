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
  createDatasetKeyedStorage<ModalMode>(parseDatasetNameFromUrl),
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
export const __unsafeModalViewportAtom = atom<ModalViewportState | null>(
  null as ModalViewportState | null,
);

/** The kinds of annotation surface the modal can mount. */
export type AnnotationSurface = "image" | "video" | "dgva" | "3d";

/**
 * The annotation surface currently mounted, reported by the surface itself.
 *
 * @internal Use `useAnnotationSurface` or `useReportAnnotationSurface`.
 */
export const __unsafeAnnotationSurfaceAtom = atom<AnnotationSurface | null>(
  null as AnnotationSurface | null,
);
