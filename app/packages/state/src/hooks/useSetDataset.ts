import { useSetReverbState } from "@fiftyone/reverb";
import { datasetName } from "../atoms";

const useSetDataset = () => {
  return useSetReverbState(datasetName);
};

export default useSetDataset;
