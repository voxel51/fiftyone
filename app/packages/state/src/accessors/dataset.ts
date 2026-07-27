import { is3d, type Schema } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  dataset,
  datasetId,
  datasetName,
  fieldSchema,
  groupMediaTypes,
  isGroup,
  selectedMediaField,
  skeleton,
  State,
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

/** What a field holds, for callers matching paths against a type constraint. */
export interface FieldType {
  ftype: string;
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
