import { selectionStyle } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import type { EventHandlerHook } from "./registerEvent";

const useSetSelectionStyle: EventHandlerHook = () => {
  const setStyle = useSetRecoilState(selectionStyle);

  return useCallback(
    (payload) => {
      const style = payload.style || { default: "checkmark" };
      setStyle(style);
    },
    [setStyle]
  );
};

export default useSetSelectionStyle;
