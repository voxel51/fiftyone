import {
  DEFAULT_LABEL_SELECTION_STYLE,
  useSessionSetter,
} from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetLabelSelectionStyle: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      const style = payload.style || DEFAULT_LABEL_SELECTION_STYLE;
      setter("labelSelectionStyle", style);
    },
    [setter]
  );
};

export default useSetLabelSelectionStyle;
