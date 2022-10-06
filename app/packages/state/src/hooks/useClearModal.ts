import { useRecoilTransaction_UNSTABLE } from "recoil";

import * as fos from "../recoil";
export default () => {
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      () => {
        const fullscreen = get(fos.fullscreen);
        if (fullscreen) {
          return;
        }

        const currentOptions = get(fos.savedLookerOptions);
        set(fos.savedLookerOptions, { ...currentOptions, showJSON: false });
        set(fos.selectedLabels, {});
        set(fos.hiddenLabels, {});
        set(fos.modal, null);
      },
    []
  );
};
