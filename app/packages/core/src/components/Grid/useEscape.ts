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
          // TODO: modal is always `null` here right after a modal closes, so this isn't the condition we want
          if (modal === null) {
            if (
              confirm(
                "You are about to clear all selections. This cannot be undone. Are you sure?"
              )
            ) {
              reset(fos.selectedSamples);
            }
          }
        },
      []
    )
  );
};

export default useEscape;
