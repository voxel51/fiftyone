import { is3d, type Schema } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useReverbCallback, useReverbValue } from "@fiftyone/reverb";
import {
  dataset,
  datasetId,
  datasetName,
  expressionCatalog,
  fieldSchema,
  groupMediaTypes,
  isGroup,
  selectedMediaField,
  skeleton,
  stageDefinitions,
  State,
  view,
} from "../atoms";

/**
 * Get the current dataset ID.
 *
 * @returns The current dataset ID, or null if no dataset is selected
 */
export const useCurrentDatasetId = (): string | null =>
  useReverbValue(datasetId);

/**
 * Get the current dataset.
 *
 * @returns The current dataset state
 */
export const useCurrentDataset = () => useReverbValue(dataset);

/**
 * Get the current dataset name.
 *
 * @returns The current dataset name
 */
export const useCurrentDatasetName = (): string | null =>
  useReverbValue(datasetName);

/**
 * Get the current sample schema.
 *
 * @returns The field schema for the sample space
 */
export const useSampleSchema = () =>
  useReverbValue(fieldSchema({ space: State.SPACE.SAMPLE }));

/**
 * The dataset's media type, with group datasets reporting `group` — matching
 * how a view stage declares the media types it applies to.
 *
 * @returns the media type, or null when no dataset is loaded
 */
export const useDatasetMediaType = (): string | null => {
  const current = useReverbValue(dataset);
  return current?.mediaType ?? null;
};

/**
 * The keys of the dataset's evaluation runs, for parameters that name one —
 * `ToEvaluationPatches.eval_key` being the reason this exists.
 *
 * @returns the evaluation keys, empty when no dataset is loaded
 */
export const useEvaluationKeys = (): string[] => {
  const current = useReverbValue(dataset);
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
  const samples = useReverbValue(fieldSchema({ space: State.SPACE.SAMPLE }));
  const frames = useReverbValue(fieldSchema({ space: State.SPACE.FRAME }));

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
  useReverbValue(fieldSchema({ space: State.SPACE.FRAME }));

/**
 * Hook to retrieve the selected media field for the grid view.
 *
 * @returns The selected media field state for the grid
 */
export const useSelectedMediaFieldGrid = () => {
  return useReverbValue(selectedMediaField(false));
};

/**
 * Whether the current dataset is a grouped dataset.
 *
 * @returns True if the current dataset is a group dataset
 */
export const useIsGroupDataset = () => {
  return useReverbValue(isGroup);
};

export type GroupSliceMediaType = "video" | "3d" | "image" | "multimodal";

/**
 * The registry key a field path resolves its skeleton under.
 *
 * Skeletons are registered against the dataset's TOP-LEVEL field name, so a
 * frame path (`frames.keypoints`) has to resolve through its last segment.
 * Without it a frame keypoint field misses the registry entirely and falls
 * through to the dataset default, which is null for most datasets.
 *
 * Exported so the rule can be tested on its own: the hook around it is a
 * `useReverbCallback`, and exercising that would mean importing Recoil into a
 * test during the Recoil->Jotai freeze.
 */
export const skeletonFieldKey = (field: string): string =>
  field.split(".").slice(-1)[0];

/**
 * Hook which provides a function to get the default keypoint skeleton for a
 * given field. Falls back to the dataset's default skeleton when the field
 * has none of its own.
 */
export const useGetKeypointSkeleton = () => {
  return useReverbCallback(
    ({ snapshot }) =>
      (field: string) =>
        snapshot.getLoadable(skeleton(skeletonFieldKey(field))).getValue(),
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
  const slices = useReverbValue(groupMediaTypes);

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
export const useExpressionCatalog = () => useReverbValue(expressionCatalog);

/** The server's stage descriptors, as `fiftyone/core/stages.py` describes them. */
export const useStageDefinitions = () => useReverbValue(stageDefinitions);

/** The applied view's stages. */
export const useView = (): State.Stage[] => useReverbValue(view);
