import { useRecoilTransaction_UNSTABLE } from "recoil";
import { modal, selectedSamples } from "../../recoil/atoms";
import { useEventHandler } from "../../utils/hooks";

const useEscape = () => {
  useEventHandler(
    document,
    "keydown",
    useRecoilTransaction_UNSTABLE(
      ({ get, set }) =>
        (event: KeyboardEvent) => {
          event.key === "Escape" &&
            !get(modal) &&
            set(selectedSamples, new Set());
        },
      []
    )
  );
};

export default useEscape;
