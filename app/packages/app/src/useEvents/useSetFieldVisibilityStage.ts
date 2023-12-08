import { subscribeBefore } from "@fiftyone/relay";
import { useSessionRef, useSessionSetter } from "@fiftyone/state";
import { useRecoilCallback } from "recoil";
import { pendingEntry } from "../Renderer";
import { useRouterContext } from "../routing";
import { resolveURL } from "../utils";
import { EventHandlerHook } from "./registerEvent";

const useSetFieldVisibilityStage: EventHandlerHook = () => {
  const setter = useSessionSetter();
  const session = useSessionRef();

  const router = useRouterContext();
  return useRecoilCallback(
    ({ set }) =>
      ({ stage }) => {
        set(pendingEntry, true);

        const unsubscribe = subscribeBefore(() => {
          session.fieldVisibilityStage = {
            cls: stage._cls,
            kwargs: stage.kwargs,
          };
          unsubscribe();
        });

        router.history.replace(
          resolveURL({
            currentPathname: router.history.location.pathname,
            currentSearch: router.history.location.search,
          }),
          {
            ...router.get().state,
            fieldVisibility: stage,
          }
        );
      },
    [session, setter]
  );
};
export default useSetFieldVisibilityStage;
