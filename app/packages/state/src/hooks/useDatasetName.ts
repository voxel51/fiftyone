import { useRecoilValue } from "recoil";
import { datasetName } from "../recoil/selectors";

export default function useDatasetName(): string | null {
  return useRecoilValue(datasetName) ?? null;
}
