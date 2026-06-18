/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  activeFields,
  colorScheme,
  colorSeed,
  datasetName,
  fieldPaths,
  groupSlice,
  modalSampleId,
  view,
} from "@fiftyone/state";
import {
  DETECTION,
  EMBEDDED_DOCUMENT_FIELD,
  type Stage,
  TEMPORAL_DETECTIONS_FIELD,
} from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { useAnnotationContext } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";

/**
 * Read accessors for the external recoil / jotai atoms the video surface
 * consumes. The rest of the package depends on these hooks rather than on
 * recoil / jotai or the foreign atoms' module paths, so there's a single
 * seam to update if an upstream atom moves or changes shape — and the
 * surrounding code reads as plain hooks, not state-library plumbing.
 */

/** Active color scheme (`@fiftyone/state`). */
export const useColorScheme = () => useRecoilValue(colorScheme);

/** Color seed used for instance / field color hashing. */
export const useColorSeed = () => useRecoilValue(colorSeed);

/** Current dataset name. */
export const useDatasetName = () => useRecoilValue(datasetName);

/** Active group slice, or `null` when the dataset isn't grouped. */
export const useGroupSlice = () => useRecoilValue(groupSlice);

/** Id of the sample open in the modal. */
export const useModalSampleId = () => useRecoilValue(modalSampleId);

/**
 * Active view stages, narrowed to the `utilities` `Stage` shape the streams
 * expect. `fos.view` is typed as `State.Stage[]`; the two are structurally
 * compatible. Empty array when no view is applied.
 */
export const useView = (): Stage[] => (useRecoilValue(view) ?? []) as Stage[];

/** Field paths active (collapsed) in the modal sidebar. */
export const useActiveModalPaths = () =>
  useRecoilValue(activeFields({ modal: true, expanded: false }));

/** Schema paths of the dataset's temporal-detections fields. */
export const useTemporalDetectionFieldPaths = () =>
  useRecoilValue(
    fieldPaths({
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: TEMPORAL_DETECTIONS_FIELD,
    })
  );

/** The overlay currently being edited in the sidebar (`@fiftyone/core`). */
export const useCurrentEditingOverlay = () =>
  useAnnotationContext().selected?.overlay ?? null;

/**
 * The detection field new frame overlays paint into and the `/frames` stream
 * reads from: the last-used detection field, falling back to the schema
 * default. Replaces core's deleted `useActiveDetectionField` — `fieldFor`
 * encapsulates the remembered → default resolution.
 */
export const useActiveDetectionField = (): string | null =>
  useAnnotationContext().lastUsed.fieldFor(DETECTION);
