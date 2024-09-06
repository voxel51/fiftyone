import { useEventHandler } from "@fiftyone/state";
import { useRecoilCallback } from "recoil";

import * as fos from "@fiftyone/state";

const useEscape = () => {
  useEventHandler(
    document,
    "keydown",
    useRecoilCallback(
      ({ reset, snapshot }) =>
        async (event: KeyboardEvent) => {
          const escapeKeyHandlerIds = await snapshot.getPromise(
            fos.escapeKeyHandlerIdsAtom
          );
          if (event.key !== "Escape" || escapeKeyHandlerIds.size > 0) {
            return;
          }

          const modal = await snapshot.getPromise(fos.modalSelector);
          modal === null && reset(fos.selectedSamples);
        },
      []
    )
  );
};

export default useEscape;
