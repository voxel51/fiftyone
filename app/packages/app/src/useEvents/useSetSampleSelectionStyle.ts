import { DEFAULT_SELECTION_STYLE, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetSampleSelectionStyle: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      const style = payload.style || DEFAULT_SELECTION_STYLE;
      setter("sampleSelectionStyle", style);
    },
    [setter]
  );
};

export default useSetSampleSelectionStyle;
