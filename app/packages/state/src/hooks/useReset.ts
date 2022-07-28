import { useRecoilTransaction_UNSTABLE } from "recoil";
import { selectedLabels, selectedSamples, view } from "../recoil";

const useReset = () => {
  return useRecoilTransaction_UNSTABLE(({ set }) => () => {
    set(selectedSamples, new Set());
    set(selectedLabels, {});
    set(view, []);
  });
};

export default useReset;
