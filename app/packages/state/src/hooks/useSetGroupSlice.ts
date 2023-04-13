import { useSetRecoilState } from "recoil";
import { groupSlice } from "../recoil";

const useSetGroupSlice = () => {
  return useSetRecoilState(groupSlice(false));
};

export default useSetGroupSlice;
