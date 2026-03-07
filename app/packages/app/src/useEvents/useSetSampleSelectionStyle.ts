import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetSampleSelectionStyle: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      const style = payload.style || { default: "checkmark", alt: "checkmark" };
      setter("sampleSelectionStyle", style);
    },
    [setter]
  );
};

export default useSetSampleSelectionStyle;
