import { useResetRecoilState, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";

export function useClearSelection() {
  const setFilters = useSetRecoilState(fos.filters);
  const resetExtendedSelection = useResetRecoilState(fos.extendedSelection);

  return {
    setFilters,
    resetExtendedSelection,
  };
}
