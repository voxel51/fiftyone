import { useSetReverbState } from "@fiftyone/reverb";
import { groupSlice } from "../atoms";

const useSetGroupSlice = () => {
  return useSetReverbState(groupSlice);
};

export default useSetGroupSlice;
