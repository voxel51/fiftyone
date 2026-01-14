import { useRecoilValue } from "recoil";
import { datasetId } from "../recoil";

export const useCurrentDatasetId = (): string | null =>
  useRecoilValue(datasetId);
