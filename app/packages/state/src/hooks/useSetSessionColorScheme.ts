import { useSetRecoilState } from "recoil";
import { colorScheme } from "../recoil";

const useSetSessionColorScheme = () => {
  return useSetRecoilState(colorScheme);
};

export default useSetSessionColorScheme;
