import { ensureColorScheme, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetColorScheme: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter(
        "colorScheme",
        ensureColorScheme(payload.color_scheme, {
          colorPool: [],
          colorBy: "field",
          opacity: 0.7,
          multicolorKeypoints: false,
        })
      );
    },
    [setter]
  );
};
export default useSetColorScheme;
