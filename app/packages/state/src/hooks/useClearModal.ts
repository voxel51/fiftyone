import { useRecoilTransaction_UNSTABLE } from "recoil";

import * as fos from "../recoil";
import useJSONPanel from "./useJSONPanel";
import useHelpPanel from "./useHelpPanel";
export default () => {
  const jsonPanel = useJSONPanel();
  const helpPanel = useHelpPanel();
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      () => {
        if (get(jsonPanel.stateAtom).isOpen) return;
        if (get(helpPanel.stateAtom).isOpen) return;
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
