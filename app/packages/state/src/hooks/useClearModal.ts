import { useRecoilTransaction_UNSTABLE } from "recoil";

import * as atoms from "../recoil";

export default () => {
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      () => {
        const fullscreen = get(atoms.fullscreen);
        if (fullscreen) {
          return;
        }
        const currentOptions = get(atoms.savedLookerOptions);
        set(atoms.savedLookerOptions, { ...currentOptions, showJSON: false });
        set(atoms.selectedLabels, {});
        set(atoms.hiddenLabels, {});
        set(atoms.modal, null);
      },
    []
  );
};
