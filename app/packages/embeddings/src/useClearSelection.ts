import { useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";

export function useClearSelection() {
  const setFilters = useSetRecoilState(fos.filters);

  return {
    setFilters,
  };
}
