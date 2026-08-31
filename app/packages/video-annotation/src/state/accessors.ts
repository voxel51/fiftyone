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
  useCurrentDatasetId,
  useIsImageDynamicGroupVideo,
  view,
} from "@fiftyone/state";
import { isFrameScopedPath } from "./framePaths";
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
 * Whether the `get_label_schemas` operator round-trip has landed. Until it
 * does, schema-gated derivations (visible fields, TD tracks) see an empty
 * set rather than the real activation state.
 */
export const useLabelSchemasLoaded = (): boolean =>
  useAtomValue(activeLabelSchemas) !== null;

/**
 * Every schema-active per-frame label field, mapped to its list label type
 * — the engine seed registers and renders exactly these (mirroring the 2D
 * surface, which paints every active field of each supported type).
 *
 * Drawn from the annotation schema's active fields per type (read-only fields
 * already filtered out by {@link useAnnotationFields}). A real video owns its
 * `frames.*` fields. An image dataset dynamically grouped into a video (ImaVid)
 * has no `frames.*` namespace — each "frame" is a sample, so it owns its
 * sample-level (non-`frames.*`) fields instead. Detection masks ride their
 * parent detection field, so no separate entry.
 */
export const useFrameLabelFields = (): Record<string, LabelType> => {
  const detectionFields = useAnnotationFields(DETECTION).fields;
  const polylineFields = useAnnotationFields(POLYLINE).fields;
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  // Keyed on CONTENT, not the source arrays' identity: a label-schema save
  // (adding a class or dynamic attribute) recreates the schema-derived arrays
  // with identical field sets, and a new `labelTypes` identity tears down the
  // engine's FrameStore, which reseeds from the never-refreshed `/frames`
  // cache — silently dropping every occurrence persisted this session (and
  // the next autosave then diffs against that stale baseline, making the
  // loss durable). Identity may only change when the field set truly does.
  const contentKey = `${detectionFields.join(
    ",",
  )}|${polylineFields.join(",")}|${isImageDynamicGroupVideo}`;

  // `useMemoOne`, not `useMemo`: React reserves the right to forget a memo,
  // and this identity is CORRECTNESS — a new object destroys the FrameStore
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

/**
 * The dataset's configured MODAL media field (default `filepath`) — the field
 * whose value names and locates each frame's media.
 */
export const useModalMediaField = (): string =>
  useRecoilValue(selectedMediaField(true));

/**
 * Frame rate driving video annotation playback for the modal sample.
 *
 * Native video samples carry `frameRate` on the sample response. An image
 * dataset dynamically grouped into a video (ImaVid) has no per-sample frame
 * rate, so fall back to the dataset's
 * `app_config.dynamic_groups_target_frame_rate`.
 */
export const useModalSampleFrameRate = (
  sample: ModalSample | null | undefined,
): number => {
  const targetFrameRate = useRecoilValue(dynamicGroupsTargetFrameRate);
  return getModalSampleFrameRate(sample) ?? targetFrameRate;
};

/**
 * Number of samples in the current modal dynamic group — the frame count for
 * an image dataset dynamically grouped into a video. Suspends until the
 * aggregation resolves rather than returning a placeholder, so the ImaVid
 * stream registers against the real count.
 *
 * Pass `enabled: false` outside the dynamic-group path to skip the count
 * aggregation entirely (returns null) while keeping hook order stable.
 */
export const useDynamicGroupElementCount = (enabled = true): number | null =>
  useRecoilValue(
    enabled ? dynamicGroupsElementCount({ modal: true }) : constSelector(null),
  );

/**
 * Value of the current modal dynamic group's group-by field — identifies which
 * group the `/frames` route should return ordered samples for. Suspends with
 * the rest of the modal sample resolution.
 *
 * `groupByFieldValue` reads the sample's `_group` (typed loosely as a dict, but
 * a scalar key in practice); the rest of the app treats it as a string (e.g.
 * `dynamicGroupPageSelector`) and the server accepts it as opaque BSON.
 */
export const useDynamicGroupValue = (): string | null =>
  (useRecoilValue(groupByFieldValue) as unknown as string | null) ?? null;

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
