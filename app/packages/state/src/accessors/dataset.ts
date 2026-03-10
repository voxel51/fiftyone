import { useRecoilValue } from "recoil";
import {
  dataset,
  datasetId,
  fieldSchema,
  selectedMediaField,
  State,
} from "../recoil";

export const useCurrentDatasetId = (): string | null =>
  useRecoilValue(datasetId);

export const useCurrentDataset = () => useRecoilValue(dataset);

/**
 * Get the current sample schema.
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
