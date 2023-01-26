import { useSetRecoilState } from "recoil";
import { extendedSelection } from "../recoil";

const useSetExtendedSelection = () => {
  const setSelection = useSetRecoilState(extendedSelection);

  return (selected: string[]) => setSelection(selected);
};

export default useSetExtendedSelection;
