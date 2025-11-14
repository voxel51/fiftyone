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
          const selectedSampleIds = await snapshot.getPromise(
            fos.selectedSamples
          );
          // TODO: modal is always `null` here right after a modal closes, so this isn't the condition we want
          if (modal === null && selectedSampleIds.size > 0) {
            if (
              confirm("Are you sure you want to clear your current selection?")
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
