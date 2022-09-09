import { useRecoilTransaction_UNSTABLE } from "recoil";
import { useEventHandler } from "../../utils/hooks";

import * as fos from "@fiftyone/state";

const useEscape = () => {
  useEventHandler(
    document,
    "keydown",
    useRecoilTransaction_UNSTABLE(
      ({ get, set }) =>
        (event: KeyboardEvent) => {
          event.key === "Escape" &&
            !get(fos.modal) &&
            set(fos.selectedSamples, new Set());
        },
      []
    )
  );
};

export default useEscape;
