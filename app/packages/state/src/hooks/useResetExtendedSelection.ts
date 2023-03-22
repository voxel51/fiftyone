import * as fos from "@fiftyone/state";
import { useRecoilTransaction_UNSTABLE } from "recoil";

export default function useResetExtendedSelection() {
  return useRecoilTransaction_UNSTABLE(({ reset }) => () => {
    reset(fos.extendedSelectionOverrideStage);
    reset(fos.extendedSelection);
  });
}
