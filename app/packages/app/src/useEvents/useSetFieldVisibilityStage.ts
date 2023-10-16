import { subscribeBefore } from "@fiftyone/relay";
import { useSessionRef, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { pendingEntry } from "../Renderer";
import { useRouterContext } from "../routing";
import { EventHandlerHook } from "./registerEvent";

const useSetFieldVisibilityStage: EventHandlerHook = () => {
  const setter = useSessionSetter();
  const session = useSessionRef();

  const setPending = useSetRecoilState(pendingEntry);
  const router = useRouterContext();
  return useCallback(
    (payload) => {
      setPending(true);
      console.log("useSetFieldVisibilityStage", payload);

      const unsubscribe = subscribeBefore(() => {
        session.fieldVisibilityStage = {
          _cls: payload.cls,
          kwargs: [
            ["field_names", payload.field_names],
            ["_allow_missing", true],
          ],
        };
        unsubscribe();
      });
      router.history.replace(
        `${router.history.location.pathname}${router.history.location.search}`,
        {
          ...router.get().state,
          extendedStages: [],
        }
      );
    },
    [setter]
  );
};
export default useSetFieldVisibilityStage;
