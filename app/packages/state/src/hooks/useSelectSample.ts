import { useRecoilTransaction_UNSTABLE } from "recoil";
import { selectedSamples } from "../recoil";
import useSetSelected from "./useSetSelected";

const useSelectSample = () => {
  const setSelected = useSetSelected();

  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      (sampleId: string) => {
        const selected = new Set(get(selectedSamples));
        selected.has(sampleId)
          ? selected.delete(sampleId)
          : selected.add(sampleId);
        set(selectedSamples, selected);
        setSelected([...selected]);
      },
    []
  );
};

export default useSelectSample;
