import { useRecoilValue } from "recoil";
import { datasetId, datasetName } from "../recoil";

export const useCurrentDatasetId = (): string | null =>
  useRecoilValue(datasetId);

export const useCurrentDatasetName = (): string | null =>
  useRecoilValue(datasetName);
