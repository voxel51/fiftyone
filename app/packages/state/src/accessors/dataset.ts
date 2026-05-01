import { useRecoilValue } from "recoil";
import {
  dataset,
  datasetId,
  datasetName,
  fieldSchema,
  selectedMediaField,
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
