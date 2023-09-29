import { useSetRecoilState } from "recoil";
import { sessionSpaces } from "../recoil";

const useSetSpaces = () => {
  return useSetRecoilState(sessionSpaces);
};

export default useSetSpaces;
