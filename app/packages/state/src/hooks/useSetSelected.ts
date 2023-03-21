import { useSetRecoilState } from "recoil";
import { selectedSamples } from "../recoil";

const useSetSelected = () => {
  return useSetRecoilState(selectedSamples);
};

export default useSetSelected;
