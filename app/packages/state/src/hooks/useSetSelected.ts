import { useSetReverbState } from "@fiftyone/reverb";
import { selectedSamples } from "../atoms";

const useSetSelected = () => {
  return useSetReverbState(selectedSamples);
};

export default useSetSelected;
