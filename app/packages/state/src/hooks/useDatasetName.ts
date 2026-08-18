import { useRecoilValue } from "recoil";
import { datasetName } from "../recoil/selectors";

export const useDatasetName = () => useRecoilValue(datasetName);
