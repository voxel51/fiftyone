import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";
import { ensureColorScheme } from "./utils";

const useSetColorScheme: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("colorScheme", ensureColorScheme(payload.color_scheme));
    },
    [setter]
  );
};
export default useSetColorScheme;
