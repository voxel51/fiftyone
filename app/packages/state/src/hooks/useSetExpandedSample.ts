import { useSetRecoilState } from "recoil";
import * as atoms from "../recoil/atoms";

export default () => {
  return useSetRecoilState(atoms.modalSampleIndex);
};
