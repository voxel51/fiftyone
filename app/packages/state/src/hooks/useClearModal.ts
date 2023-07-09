import { useRecoilCallback } from "recoil";

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
  return useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async () => {
        const fullscreen = await snapshot.getPromise(fos.fullscreen);
        if (fullscreen) {
          return;
        }

        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );
        set(fos.savedLookerOptions, { ...currentOptions, showJSON: false });
        reset(fos.selectedLabels);
        reset(fos.hiddenLabels);
        set(fos.currentModalSample, null);
      },
    []
  );
};
