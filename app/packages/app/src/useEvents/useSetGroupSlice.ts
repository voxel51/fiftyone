import { subscribeBefore } from "@fiftyone/relay";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetGroupSlice: EventHandlerHook = ({ router, session }) => {
  return useCallback(
    ({ slice }) => {
      const search = new URLSearchParams(router.history.location.search);
      slice ? search.set("slice", slice) : search.delete("slice");

      const string = `?${search.toString()}`;

      const pathname = router.history.location.pathname + string;
      subscribeBefore(() => {
        session.current.sessionGroupSlice = slice;
      });

      router.push(pathname, {
        ...router.location.state,
        event: "slice",
        groupSlice: slice,
      });
    },
    [router, session]
  );
};

export default useSetGroupSlice;
