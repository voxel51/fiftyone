import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import * as state from "./state";

export default function useShow(modal: boolean, named: boolean, path: string) {
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const hasBounds = useRecoilValue(
    state.hasBounds({
      path,
      modal,
      shouldCalculate: !queryPerformance || modal,
    })
  );

  return {
    show: hasBounds || (queryPerformance && !modal) || !named,
    showLoadButton: named && queryPerformance && !modal,
  };
}
