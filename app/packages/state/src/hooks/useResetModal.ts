import { useReverbCallback, useSetReverbState } from "@fiftyone/reverb";

import { useCallback } from "react";
import * as fos from "../atoms";

/**
 * Resets the modal's session state. Closing goes through `useClearModal`,
 * which navigates first where the URL owns the open sample; this is what
 * follows the URL.
 */
export default () => {
  const setModal = useSetReverbState(fos.modalSelector);
  const close = useReverbCallback(
    ({ reset, set, snapshot }) =>
      async () => {
        const fullscreen = await snapshot.getPromise(fos.fullscreen);
        if (fullscreen) {
          return false;
        }

        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions,
        );
        set(fos.savedLookerOptions, { ...currentOptions, showJSON: false });
        reset(fos.hiddenLabels);
        fos.modalNavigation.set(null);
        return true;
      },
    [],
  );

  return useCallback(() => {
    close();
    setModal(null);
  }, [close, setModal]);
};
