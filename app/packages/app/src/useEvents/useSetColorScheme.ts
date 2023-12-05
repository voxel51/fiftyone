import { ensureColorScheme, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetColorScheme: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      // we don't send rgb list to GraphQL
      setter("colorScheme", ensureColorScheme(payload.color_scheme));
    },
    [setter]
  );
};
export default useSetColorScheme;
