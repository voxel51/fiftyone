import { useSetReverbState } from "@fiftyone/reverb";
import { colorScheme } from "../atoms";

const useSetSessionColorScheme = () => {
  return useSetReverbState(colorScheme);
};

export default useSetSessionColorScheme;
