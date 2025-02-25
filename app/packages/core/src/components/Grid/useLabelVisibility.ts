import { activeLabelFields } from "@fiftyone/state";
import { useRecoilCallback } from "recoil";
import { gridActivePathsLUT } from "../Sidebar/useDetectNewActiveLabelFields";

export default () =>
  useRecoilCallback(
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
  );
