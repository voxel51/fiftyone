import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetSelectionStyle: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      const style = payload.style || { default: "checkmark", alt: "checkmark" };
      setter("selectionStyle", style);
    },
    [setter]
  );
};

export default useSetSelectionStyle;
