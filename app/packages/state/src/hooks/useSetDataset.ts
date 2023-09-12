import { useSetRecoilState } from "recoil";
import { datasetName } from "../recoil";

const useSetDataset = () => {
  return useSetRecoilState(datasetName);
};

export default useSetDataset;
