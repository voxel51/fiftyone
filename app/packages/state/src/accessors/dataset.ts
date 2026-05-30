import { is3d } from "@fiftyone/utilities";
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

export type GroupSliceMediaType = "video" | "3d" | "image";

/**
 * Hook which provides a function to get the default keypoint skeleton for a
 * given field.
 */
export const useGetKeypointSkeleton = () => {
  return useRecoilCallback(
    ({ snapshot }) =>
      (field: string) =>
        snapshot.getLoadable(skeleton(field)).getValue(),
    []
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
      })
    )
    .map(({ name }) => name);
};
