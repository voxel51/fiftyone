import { useSetReverbState } from "@fiftyone/reverb";
import { view } from "../atoms";

const useSetView = () => {
  return useSetReverbState(view);
};

export default useSetView;
