import { is3d, type Schema } from "@fiftyone/utilities";
import { useMemo } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { selectedSamples, selectionScopeBoundary } from "../recoil/atoms";
import { groupSlice } from "../recoil/groups";
import {
  anyTagging,
  canTagSamplesOrLabels,
  readOnly,
  dataset,
  datasetId,
  datasetName,
  datasetSampleCount,
  expressionCatalog,
  extendedStages,
  filters,
  fieldSchema,
  groupMediaTypes,
  gridSortBy,
  isGroup,
  isClipsView,
  isFramesView,
  isPatchesView,
  selectedMediaField,
  refresher,
  skeleton,
  stageDefinitions,
  State,
  view,
} from "../recoil";

/**
 * Get the current dataset ID.
 *
 * @returns The current dataset ID, or null if no dataset is selected
 */
export const useCurrentDatasetId = (): string | null =>
  useRecoilValue(datasetId);

/**
 * Get the current dataset.
 *
 * @returns The current dataset state
 */
export const useCurrentDataset = () => useRecoilValue(dataset);

/**
 * Get the current dataset name.
 *
 * @returns The current dataset name
 */
export const useCurrentDatasetName = (): string | null =>
  useRecoilValue(datasetName);

/**
 * Get the current sample schema.
 *
 * @returns The field schema for the sample space
 */
export const useSampleSchema = () =>
  useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));

/**
 * The dataset's media type, with group datasets reporting `group` — matching
 * how a view stage declares the media types it applies to.
 *
 * @returns the media type, or null when no dataset is loaded
 */
export const useDatasetMediaType = (): string | null => {
  const current = useRecoilValue(dataset);
  return current?.mediaType ?? null;
};

/**
 * The keys of the dataset's evaluation runs, for parameters that name one —
 * `ToEvaluationPatches.eval_key` being the reason this exists.
 *
 * @returns the evaluation keys, empty when no dataset is loaded
 */
export const useEvaluationKeys = (): string[] => {
  const current = useRecoilValue(dataset);
  return useMemo(
    () => (current?.evaluations ?? []).map((run) => run.key),
    [current?.evaluations],
  );
};

/** What a field holds, for callers matching paths against a type constraint. */
export interface FieldType {
  ftype: string;
  /** A list field's element type. */
  subfield: string | null;
  embeddedDocType: string | null;
  /** Frame-level fields are addressed as `frames.<path>`. */
  frame: boolean;
}

const flatten = (
  schema: Schema,
  frame: boolean,
  into: Map<string, FieldType>,
): Map<string, FieldType> => {
  for (const field of Object.values(schema)) {
    const path = frame ? `frames.${field.path}` : field.path;
    into.set(path, {
      ftype: field.ftype,
      subfield: field.subfield ?? null,
      embeddedDocType: field.embeddedDocType,
      frame,
    });

    if (field.fields) {
      flatten(field.fields, frame, into);
    }
  }

  return into;
};

/**
 * Every field path in the dataset and what it holds, sample and frame alike.
 *
 * Flat rather than nested, because callers ask about a path they already have —
 * matching a field against a type restriction, say — not about the shape of the
 * schema.
 *
 * @returns field types keyed by the path used to address them
 */
export const useFieldTypes = (): ReadonlyMap<string, FieldType> => {
  const samples = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
  const frames = useRecoilValue(fieldSchema({ space: State.SPACE.FRAME }));

  return useMemo(() => {
    const types = flatten(samples, false, new Map<string, FieldType>());
    return flatten(frames, true, types);
  }, [samples, frames]);
};

/**
 * Get the current FRAME field schema — the per-frame fields of a video
 * dataset, keyed WITHOUT the `frames.` prefix that sidebar paths carry.
 *
 * @returns The field schema for the frame space
 */
export const useFrameSchema = () =>
  useRecoilValue(fieldSchema({ space: State.SPACE.FRAME }));

/**
 * Hook to retrieve the selected media field for the grid view.
 *
 * @returns The selected media field state for the grid
 */
export const useSelectedMediaFieldGrid = () => {
  return useRecoilValue(selectedMediaField(false));
};

/**
 * Whether the current dataset is a grouped dataset.
 *
 * @returns True if the current dataset is a group dataset
 */
export const useIsGroupDataset = () => {
  return useRecoilValue(isGroup);
};

export type GroupSliceMediaType = "video" | "3d" | "image" | "multimodal";

/**
 * Hook which provides a function to get the default keypoint skeleton for a
 * given field.
 */
export const useGetKeypointSkeleton = () => {
  return useRecoilCallback(
    ({ snapshot }) =>
      (field: string) =>
        snapshot.getLoadable(skeleton(field)).getValue(),
    [],
  );
};

/**
 * Returns the names of dataset-level group slices whose media type matches
 * any of the provided types.
 *
 * @param mediaTypes - The media types to filter by. "3d" matches all 3D
 *   types (fo3d, point-cloud, etc.).
 * @returns Slice names matching the requested media types, in dataset order.
 */
export const useGroupSlices = (mediaTypes: GroupSliceMediaType[]): string[] => {
  const slices = useRecoilValue(groupMediaTypes);

  return slices
    .filter(({ mediaType }) =>
      mediaTypes.some((type) => {
        if (type === "3d") return is3d(mediaType);
        return mediaType === type;
      }),
    )
    .map(({ name }) => name);
};

/**
 * The operator catalog the expression editor suggests from, exactly as the
 * server describes it — or null before the query has resolved, which callers
 * treat as "suggest nothing rather than something wrong".
 */
export const useExpressionCatalog = () => useRecoilValue(expressionCatalog);

/** The server's stage descriptors, as `fiftyone/core/stages.py` describes them. */
export const useStageDefinitions = () => useRecoilValue(stageDefinitions);

/** The applied view's stages. */
export const useView = (): State.Stage[] => useRecoilValue(view);

/** Current grid pipeline inputs, without pagination or explicit selection. */
export function useGridViewScope() {
  return {
    view: useView(),
    filters: useRecoilValue(filters),
    extendedStages: useRecoilValue(extendedStages),
    sort: useRecoilValue(gridSortBy),
    refresh: useRecoilValue(refresher),
  };
}

/** Publishes the tray's browsing boundary for legacy view-scoped queries. */
export function useSetSelectionScopeBoundary() {
  return useSetRecoilState(selectionScopeBoundary);
}

/** The dataset's estimated sample count, before any view stage or filter. */
export function useDatasetSampleCount() {
  return useRecoilValue(datasetSampleCount);
}

/** Clears the range-producing temporal tag constraint when returning to episodes. */
export function useClearTemporalTagConstraint() {
  return useRecoilCallback(
    ({ set }) =>
      () => {
        set(filters, (current) => {
          const next = { ...current };
          delete next._temporal_tags;
          return next;
        });
      },
    [],
  );
}

/** Whether the view converts parent episodes into another result identity. */
export function useIsConvertedView() {
  const clips = useRecoilValue(isClipsView);
  const frames = useRecoilValue(isFramesView);
  const patches = useRecoilValue(isPatchesView);
  return clips || frames || patches;
}

/** Shared tagging policy, including Enterprise session permissions. */
export function useSelectionTagDisabledReason(): string | null {
  const permission = useRecoilValue(canTagSamplesOrLabels);
  const locked = useRecoilValue(readOnly);
  const tagging = useRecoilValue(anyTagging);
  if (locked) return "This session is read-only";
  if (!permission.enabled)
    return (
      permission.message?.replace("#action", "tag episodes or segments") ??
      "Tagging is not permitted"
    );
  return tagging ? "Another tagging operation is in progress" : null;
}

/**
 * The legacy selected-samples session, read and written as one accessor so
 * the grid selection tray can stay in step with lookers, the modal, and
 * operators without new Recoil usage elsewhere.
 */
export function useLegacySelectedSamples() {
  return useRecoilState(selectedSamples);
}

/** The active group slice the grid shows, or null outside grouped datasets. */
export function useGridGroupSlice(): string | null {
  return useRecoilValue(groupSlice);
}
