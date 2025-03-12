import { activeLabelFields } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { gridActivePathsLUT } from "../Sidebar/useDetectNewActiveLabelFields";

export default () => ({
  onDispose: useCallback((key: string) => gridActivePathsLUT.delete(key), []),
  onSet: useRecoilCallback(
    ({ snapshot }) =>
      (key: string) => {
        const currentActiveLabelFields = snapshot
          .getLoadable(activeLabelFields({ modal: false }))
          .getValue();
        if (currentActiveLabelFields && !gridActivePathsLUT.has(key)) {
          gridActivePathsLUT.set(key, new Set(currentActiveLabelFields));
        }
      },
    []
  ),
});
