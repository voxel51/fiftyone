import { useRecoilCallback, useSetRecoilState } from "recoil";

import { useCallback } from "react";
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
  const setModal = useSetRecoilState(fos.modalSelector);
  const close = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async () => {
        const fullscreen = await snapshot.getPromise(fos.fullscreen);
        if (fullscreen) {
          return false;
        }

        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );
        set(fos.savedLookerOptions, { ...currentOptions, showJSON: false });
        reset(fos.selectedLabels);
        reset(fos.hiddenLabels);
        fos.modalNavigation.set(null);
        return true;
      },
    []
  );

  return useCallback(() => {
    close();
    setModal(null);
  }, [close, setModal]);
};
