import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import * as state from "./state";

export default function useShow(
  modal: boolean,
  named: boolean,
  path: string,
  showRange: boolean
) {
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const hasBounds = useRecoilValue(
    state.hasBounds({ path, modal, shouldCalculate: !queryPerformance })
  );
  const indexed = useRecoilValue(fos.pathHasIndexes(path));
  const frameField = useRecoilValue(fos.isFrameField(path));

  return {
    show: !(!queryPerformance && named && !hasBounds),
    showLoadButton: named && queryPerformance && !showRange && !modal,
    showQueryPerformanceIcon:
      named && queryPerformance && indexed && !frameField && !modal,
  };
}
