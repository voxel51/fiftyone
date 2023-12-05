import { useSetRecoilState } from "recoil";
import { view } from "../recoil";

const useSetView = () => {
  return useSetRecoilState(view);
};

export default useSetView;
