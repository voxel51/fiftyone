import { useSetReverbState } from "@fiftyone/reverb";
import { selectedLabels } from "../atoms";

const useSetSelectedLabels = () => {
  return useSetReverbState(selectedLabels);
};

export default useSetSelectedLabels;
