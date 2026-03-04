import { altSelectionMode, selectionStyle } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import type { EventHandlerHook } from "./registerEvent";

const useSetSelectionStyle: EventHandlerHook = () => {
  const setStyle = useSetRecoilState(selectionStyle);
  const setAltMode = useSetRecoilState(altSelectionMode);

  return useCallback(
    (payload) => {
      const style = payload.style || { default: "checkmark" };
      setStyle(style);
      setAltMode(!!style.alt);
    },
    [setStyle, setAltMode]
  );
};

export default useSetSelectionStyle;
