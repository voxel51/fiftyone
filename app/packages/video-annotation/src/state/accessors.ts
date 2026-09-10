/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  colorScheme,
  colorSeed,
  datasetName,
  dynamicGroupsElementCount,
  dynamicGroupsTargetFrameRate,
  fieldPaths,
  groupByFieldValue,
  groupSlice,
  type ModalSample,
  modalSampleId,
  selectedMediaField,
  State,
  useCurrentDatasetId,
  useIsImageDynamicGroupVideo,
  view,
} from "@fiftyone/state";
import { isFrameScopedPath } from "./framePaths";
import {
  CLASSIFICATION_FIELD,
  CLASSIFICATIONS_FIELD,
  DETECTION,
  EMBEDDED_DOCUMENT_FIELD,
  LabelType,
  POLYLINE,
  type Stage,
  TEMPORAL_DETECTIONS_FIELD,
} from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useMemoOne } from "use-memo-one";
import { constSelector, useRecoilValue } from "recoil";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import {
  activeLabelSchemas,
  visibleLabelSchemas,
} from "../../../core/src/components/Modal/Sidebar/Annotate/state";
import { getModalSampleFrameRate } from "../utils/modalSample";

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

/** Active view stages as the structurally compatible `utilities` `Stage[]`; empty when no view is applied. */
export const useView = (): Stage[] => (useRecoilValue(view) ?? []) as Stage[];

/** Schema paths of the dataset's temporal-detections fields. */
export const useTemporalDetectionFieldPaths = () =>
  useRecoilValue(
    fieldPaths({
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: TEMPORAL_DETECTIONS_FIELD,
    }),
  );

/**
 * Schema paths of the dataset's sample-level classification fields, single and
 * list alike. `space: SAMPLE` keeps `frames.*` out, since the composite store
 * routes each path to exactly one owner.
 */
export const useSampleClassificationFieldPaths = () =>
  useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: [CLASSIFICATION_FIELD, CLASSIFICATIONS_FIELD],
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
 * The label paths visible in the annotate sidebar (annotation-active and
 * explore-active) in the engine namespace. Referentially stable so the
 * bridge's `paths` scope only re-creates on a real visibility change.
 */
export const useVisibleLabelSchemas = (): ReadonlySet<string> => {
  const visible = useAtomValue(visibleLabelSchemas);
  return useMemo(() => new Set(visible), [visible]);
};

/**
 * Whether the `get_label_schemas` operator round-trip has landed. Until it
 * does, schema-gated derivations (visible fields, TD tracks) see an empty
 * set rather than the real activation state.
 */
export const useLabelSchemasLoaded = (): boolean =>
  useAtomValue(activeLabelSchemas) !== null;

/**
 * Every schema-active per-frame label field mapped to its list label type;
 * the engine seed registers and renders exactly these. A real video owns its
 * `frames.*` fields, while an image dataset grouped into a video owns its
 * sample-level fields instead.
 */
export const useFrameLabelFields = (): Record<string, LabelType> => {
  const detectionFields = useAnnotationFields(DETECTION).fields;
  const polylineFields = useAnnotationFields(POLYLINE).fields;
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  // Keyed on content, not array identity: a new `labelTypes` identity tears
  // down the engine's FrameStore, which reseeds from the stale `/frames` cache
  // and drops every occurrence persisted this session.
  const contentKey = `${detectionFields.join(
    ",",
  )}|${polylineFields.join(",")}|${isImageDynamicGroupVideo}`;

  // `useMemoOne`, not `useMemo`: React may forget a memo, and a new object
  // here destroys the FrameStore
  return useMemoOne(() => {
    const fields: Record<string, LabelType> = {};

    const owns = (field: string): boolean =>
      isFrameScopedPath(field, isImageDynamicGroupVideo);

    for (const field of detectionFields) {
      if (owns(field)) {
        fields[field] = LabelType.Detections;
      }
    }

    for (const field of polylineFields) {
      if (owns(field)) {
        fields[field] = LabelType.Polylines;
      }
    }

    return fields;
  }, [contentKey]);
};

/** The dataset's modal media field (default `filepath`), which locates each frame's media. */
export const useModalMediaField = (): string =>
  useRecoilValue(selectedMediaField(true));

/**
 * Frame rate driving video annotation playback for the modal sample. An image
 * dataset grouped into a video has no per-sample rate, so it falls back to
 * `app_config.dynamic_groups_target_frame_rate`.
 */
export const useModalSampleFrameRate = (
  sample: ModalSample | null | undefined,
): number => {
  const targetFrameRate = useRecoilValue(dynamicGroupsTargetFrameRate);
  return getModalSampleFrameRate(sample) ?? targetFrameRate;
};

/**
 * Member count of the current modal dynamic group, suspending until the
 * aggregation resolves. `enabled: false` skips the aggregation (returns null)
 * while keeping hook order stable.
 */
export const useDynamicGroupElementCount = (enabled = true): number | null =>
  useRecoilValue(
    enabled ? dynamicGroupsElementCount({ modal: true }) : constSelector(null),
  );

/**
 * The current modal dynamic group's group-by value, or null when the modal is
 * not an image dataset grouped into a video. The server injects `_group` for
 * any `group_by` stage, so the value is gated on the image-backed case.
 */
export const useDynamicGroupValue = (): string | null => {
  const value = useRecoilValue(groupByFieldValue) as unknown as string | null;
  return useIsImageDynamicGroupVideo() ? (value ?? null) : null;
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
