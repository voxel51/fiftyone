/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  colorScheme,
  colorSeed,
  datasetName,
  fieldPaths,
  groupSlice,
  modalSampleId,
  useCurrentDatasetId,
  view,
} from "@fiftyone/state";
import { FRAMES_PREFIX } from "@fiftyone/annotation";
import {
  DETECTION,
  EMBEDDED_DOCUMENT_FIELD,
  LabelType,
  POLYLINE,
  type Stage,
  TEMPORAL_DETECTIONS_FIELD,
} from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { visibleLabelSchemas } from "../../../core/src/components/Modal/Sidebar/Annotate/state";

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

/** Current dataset id — the `EntityId` namespace for engine signal keys. */
export const useDatasetId = (): string => useCurrentDatasetId() ?? "";

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

/** Schema paths of the dataset's temporal-detections fields. */
export const useTemporalDetectionFieldPaths = () =>
  useRecoilValue(
    fieldPaths({
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: TEMPORAL_DETECTIONS_FIELD,
    }),
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

/**
 * The label paths visible in the annotate sidebar — annotation-active ∩
 * explore-active — in the engine namespace (frame fields as `frames.*`). The
 * canvas overlays and timeline tracks gate rendering on this set so that
 * deactivating a field in the schema manager (or hiding it in Explore) hides it
 * everywhere, exactly like the sidebar. Returns a referentially-stable set so
 * the bridge's `paths` scope only re-creates on a real visibility change.
 */
export const useVisibleLabelSchemas = (): ReadonlySet<string> => {
  const visible = useAtomValue(visibleLabelSchemas);
  return useMemo(() => new Set(visible), [visible]);
};

/**
 * Every schema-active per-frame label field, mapped to its list label type
 * — the engine seed registers and renders exactly these (mirroring the 2D
 * surface, which paints every active field of each supported type).
 *
 * Drawn from the annotation schema's active fields per type (read-only fields
 * already filtered out by {@link useAnnotationFields}) and narrowed to the
 * `frames.*` namespace, since the video surface only owns per-frame labels.
 * Detection masks ride their parent detection field, so no separate entry.
 */
export const useFrameLabelFields = (): Record<string, LabelType> => {
  const detectionFields = useAnnotationFields(DETECTION).fields;
  const polylineFields = useAnnotationFields(POLYLINE).fields;

  return useMemo(() => {
    const fields: Record<string, LabelType> = {};

    for (const field of detectionFields) {
      if (field.startsWith(FRAMES_PREFIX)) {
        fields[field] = LabelType.Detections;
      }
    }

    for (const field of polylineFields) {
      if (field.startsWith(FRAMES_PREFIX)) {
        fields[field] = LabelType.Polylines;
      }
    }

    return fields;
  }, [detectionFields, polylineFields]);
};

/**
 * Dynamic-attribute names for a label field path. Re-exported from core so the
 * read hits the same `labelSchemaData` atom instance core writes (a direct
 * cross-package atom import would resolve to a different, never-written family).
 */
export {
  useDynamicAttributeNames,
  useDynamicAttributeNamesGetter,
  labelSchemaData,
} from "../../../core/src/components/Modal/Sidebar/Annotate/state";
