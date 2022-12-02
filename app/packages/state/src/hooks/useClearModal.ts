import { useRecoilTransaction_UNSTABLE } from "recoil";

import * as fos from "../recoil";

/**
 * A react hook that allows clearing the modal state.
 * @example
 * const clearModal = useClearModal();
 * <Button onClick={clearModal}>Close Modal</Button>
 * @returns A function that clears the modal state.
 */

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
