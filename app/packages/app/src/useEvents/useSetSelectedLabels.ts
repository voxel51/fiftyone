import { State, useSessionSetter } from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetSelectedLabels: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload: any) => {
      setter(
        "selectedLabels",
        toCamelCase(payload.labels) as State.SelectedLabel[]
      );
    },
    [setter]
  );
};

export default useSetSelectedLabels;
