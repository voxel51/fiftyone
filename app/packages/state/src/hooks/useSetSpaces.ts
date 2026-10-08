import { useSetReverbState } from "@fiftyone/reverb";
import { sessionSpaces } from "../atoms";

const useSetSpaces = () => {
  return useSetReverbState(sessionSpaces);
};

export default useSetSpaces;
