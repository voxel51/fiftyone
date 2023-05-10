import { useRecoilTransaction_UNSTABLE } from "recoil";
import { useEventHandler } from "@fiftyone/state";

import * as fos from "@fiftyone/state";

const useEscape = () => {
  useEventHandler(
    document,
    "keydown",
    useRecoilTransaction_UNSTABLE(
      ({ get, reset }) =>
        (event: KeyboardEvent) => {
          event.key === "Escape" &&
            !get(fos.modal) &&
            reset(fos.selectedSamples);
        },
      []
    )
  );
};

export default useEscape;
