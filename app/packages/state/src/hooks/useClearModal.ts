import { useRecoilTransaction_UNSTABLE } from "recoil";

import * as fos from "../recoil";

/**
 * A react hook that allows clearing the modal state.
 *
 * @example
 * ```ts
 * function MyComponent() {
 *   const clearModal = useClearModal();
 *   return (
 *    <button onClick={clearModal}>Close Modal</button>
 *   )
 * }
 * ```
 *
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
        set(fos.currentModalSample, null);
      },
    []
  );
};
