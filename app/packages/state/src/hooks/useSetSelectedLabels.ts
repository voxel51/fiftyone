import { useSetRecoilState } from "recoil";
import { selectedLabels } from "../recoil";

const useSetSelectedLabels = () => {
  return useSetRecoilState(selectedLabels);
};

export default useSetSelectedLabels;
